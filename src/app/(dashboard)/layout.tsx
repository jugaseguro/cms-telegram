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
import { useTabTitle } from '@/hooks/use-tab-title'
import { toast } from 'sonner'

const supabase = createClient()

const PROFILE_SELECT = 'id, email, full_name, role, avatar_url, created_at'

/** How often to check if the session is still valid (5 minutes) */
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000

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

    // Give the toast time to show before redirecting
    setTimeout(() => {
      supabase.auth.signOut().finally(() => {
        signOutInProgress.current = false
        router.push('/login')
        router.refresh()
      })
    }, 1500)
  }, [router])

  useRealtimeConversations(isInitialized)
  useTabTitle()

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
          handleSessionExpired()
          return
        }
        setUser(user)
        const { data: profile } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT)
          .eq('id', user.id)
          .single()
        if (profile) setProfile(profile)
      } finally {
        setInitialized(true)
      }
    }
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Initial auth is handled by loadUser() with server-validated getUser().
        // Ignoring INITIAL_SESSION prevents a race where a stale local session
        // (null) overwrites the correct user state set by loadUser().
        if (event === 'INITIAL_SESSION') return

        // Handle token refresh failure or explicit sign out
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

        setUser(session?.user ?? null)
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select(PROFILE_SELECT)
            .eq('id', session.user.id)
            .single()
          if (profile) setProfile(profile)
        } else {
          setProfile(null)
        }
      }
    )

    // Periodic session check: server-validated via getUser() which also
    // triggers an automatic token refresh if needed.
    const intervalId = setInterval(async () => {
      const { data: { user: currentUser }, error } = await supabase.auth.getUser()
      if (error || !currentUser) {
        handleSessionExpired()
      }
    }, SESSION_CHECK_INTERVAL)

    return () => {
      subscription.unsubscribe()
      clearInterval(intervalId)
    }
  }, [setUser, setProfile, setInitialized, handleSessionExpired])

  // Re-validate auth when the user returns to the tab (e.g. after being away
  // long enough for the session to expire). Throttled to at most once per 30s.
  useEffect(() => {
    let lastCheck = Date.now()

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastCheck < 30_000) return
      lastCheck = Date.now()

      supabase.auth.getUser().then(({ data: { user }, error }) => {
        if (error || !user) {
          handleSessionExpired()
          return
        }
        setUser(user)
      })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [handleSessionExpired, setUser])

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
