'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { Skeleton } from '@/components/ui/skeleton'
import { RealtimeStatusBanner } from '@/components/layout/realtime-status-banner'
import { useRealtimeConversations } from '@/hooks/use-realtime'
import { useSocket } from '@/hooks/use-socket'
import { useSocketConversations } from '@/hooks/use-socket-conversations'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useTabTitle } from '@/hooks/use-tab-title'
import { toast } from 'sonner'

const PROFILE_SELECT = 'id, email, full_name, role, avatar_url, created_at'

/** Clears both localStorage and cookies for Supabase auth, then hard-redirects.
 *  This prevents the middleware redirect loop (cookie exists → middleware allows
 *  dashboard → browser has no session → fails → redirect to login → middleware
 *  sees cookie → redirect back to dashboard → loop).
 */
function clearAuthAndRedirect() {
  // Clear localStorage auth entries
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key?.includes('sb-') || key?.includes('supabase')) {
      localStorage.removeItem(key)
    }
  }
  // Clear auth cookies so middleware doesn't redirect back from /login
  document.cookie.split(';').forEach((c) => {
    const name = c.trim().split('=')[0]
    if (name.includes('sb-')) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    }
  })
  window.location.href = '/login'
}
// Last-resort timeout for the initial auth check. The Supabase client already
// has a 15s fetch timeout (fetchWithTimeout), so this only fires if something
// else in the auth pipeline hangs (lock contention, internal retries, etc.).
const AUTH_TIMEOUT_MS = 20_000

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { setUser, setProfile, setInitialized, isInitialized } = useAuthStore()
  const router = useRouter()
  const signOutInProgress = useRef(false)

  const handleSessionExpired = useCallback(() => {
    if (signOutInProgress.current) return
    signOutInProgress.current = true

    toast.error('Tu sesión ha expirado. Redirigiendo al login...', {
      duration: 4000,
    })

    // Give the toast time to show before redirecting.
    // signOut() can hang if the auth client is broken (expired token, no session),
    // so we race it against a hard redirect as a safety net.
    setTimeout(() => {
      const supabase = createClient()

      const hardRedirect = setTimeout(() => {
        clearAuthAndRedirect()
      }, 5_000)

      supabase.auth.signOut().finally(() => {
        clearTimeout(hardRedirect)
        clearAuthAndRedirect()
      })
    }, 1500)
  }, [router])

  const chatV2 = useFeatureFlags((s) => s.chatV2)

  // v2: Socket.IO connection + conversations listener
  useSocket()
  useSocketConversations()

  // v1: Supabase Realtime (fallback when chatV2 is off)
  useRealtimeConversations(!chatV2 && isInitialized)

  useTabTitle()

  useEffect(() => {
    const supabase = createClient()

    async function loadProfile(userId: string) {
      const { data: profile } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', userId)
        .single()
      if (profile) setProfile(profile)
    }

    async function loadUser() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          handleSessionExpired()
          return
        }

        if (session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id)

          // Background validation: getUser() makes a server call to verify
          // the token is still valid. If it fails, sign out.
          supabase.auth.getUser().then(({ error }) => {
            if (error) {
              console.warn('[DashboardLayout] Background auth validation failed:', error.message)
              handleSessionExpired()
            }
          })
          return
        }

        // Fresh reloads can briefly see a null local session before Supabase
        // finishes hydrating persisted auth state. Before treating that as a
        // real logout, ask the auth server once.
        const { data: userData, error: userError } = await Promise.race([
          supabase.auth.getUser(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('AUTH_TIMEOUT')), AUTH_TIMEOUT_MS)
          ),
        ])

        if (userError || !userData.user) {
          console.warn('[DashboardLayout] No session after reload:', userError?.message ?? 'missing user')
          handleSessionExpired()
          return
        }

        setUser(userData.user)
        await loadProfile(userData.user.id)
      } catch (err) {
        const message = (err as Error).message
        console.warn('[DashboardLayout] Auth failed:', message)

        if (message === 'AUTH_TIMEOUT') {
          toast.error('La sesión tardó demasiado en restaurarse. Probá recargar una vez más.')
        } else {
          handleSessionExpired()
        }
      } finally {
        setInitialized(true)
      }
    }
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') return

        if (event === 'TOKEN_REFRESHED' && !session) {
          handleSessionExpired()
          return
        }

        if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          if (!signOutInProgress.current) {
            handleSessionExpired()
          }
          return
        }

        // Only update user state — DO NOT make Supabase data queries here.
        // This callback can fire during _initialize() while the auth lock is
        // held. Any Supabase query calls _getAccessToken() → getSession() →
        // awaits initializePromise → deadlock.
        setUser(session?.user ?? null)
        if (!session?.user) {
          setProfile(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [setUser, setProfile, setInitialized, handleSessionExpired])

  // Visibility-based recovery is handled by useSessionRecovery (in providers.tsx).
  // It resets the client, refreshes auth, and redirects to /login if dead.
  // Having multiple visibility handlers caused auth lock contention (4 handlers
  // each waiting 12s = 48s freeze).

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <RealtimeStatusBanner />
        <Header />
        <main className="flex-1 overflow-auto bg-background p-6 animate-fade-in-up scrollbar-thin">
          {isInitialized ? children : <DashboardSkeleton />}
        </main>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
