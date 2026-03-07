'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

const supabase = createClient()

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { setUser, setProfile } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        // Fetch profile in parallel — user is already available
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, avatar_url, created_at')
          .eq('id', user.id)
          .single()
        if (profile) setProfile(profile)
      }
    }
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, full_name, role, avatar_url, created_at')
            .eq('id', session.user.id)
            .single()
          if (profile) setProfile(profile)
        } else {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [setUser, setProfile])

  return (
    <div className="flex h-screen overflow-hidden">
      {mounted && <Sidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        {mounted && <Header />}
        <main className="flex-1 overflow-auto bg-background p-6 animate-fade-in-up">
          {children}
        </main>
      </div>
    </div>
  )
}
