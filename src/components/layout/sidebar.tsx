'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { useAgentPresence } from '@/hooks/use-presence'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquare,
  Users,
  DollarSign,
  LayoutDashboard,
  Shield,
  BarChart3,
  BotMessageSquare,
  Tag,
  RefreshCw,
  LogOut,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Chats', href: '/chats', icon: MessageSquare },
  { name: 'Clientes', href: '/customers', icon: Users },
  { name: 'Transacciones', href: '/transactions', icon: DollarSign },
  { name: 'Reportes', href: '/reports', icon: BarChart3 },
]

const adminNavigation = [
  { name: 'Agentes', href: '/admin/agents', icon: Shield },
  { name: 'Respuestas auto', href: '/admin/auto-responses', icon: BotMessageSquare },
  { name: 'Etiquetas', href: '/admin/labels', icon: Tag },
  { name: 'Recontacto', href: '/admin/recontact', icon: RefreshCw },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, user } = useAuthStore()
  const unreadCount = useChatStore((s) => s.unreadConversationIds.size)
  const onlineAgents = useAgentPresence()

  const otherOnlineAgents = useMemo(
    () => onlineAgents.filter((a) => a.agent_id !== user?.id),
    [onlineAgents, user?.id]
  )

  const allNav = useMemo(() => [
    ...navigation,
    ...(profile?.role === 'admin' ? adminNavigation : []),
  ], [profile?.role])

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card/80 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-md shadow-primary/20">
          <MessageSquare className="h-4.5 w-4.5 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold tracking-tight">CRM Telegram</span>
          <span className="text-[10px] font-medium text-muted-foreground">Panel de gestión</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-3 scrollbar-thin overflow-y-auto">
        {allNav.map((item, index) => {
          const isActive = pathname.startsWith(item.href)
          const showDivider = index === navigation.length && profile?.role === 'admin'
          return (
            <div key={item.href}>
              {showDivider && (
                <div className="mx-3 my-2.5 flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Admin</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <Link
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary/10 text-primary shadow-sm shadow-primary/5'
                    : 'text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                )}
              >
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200',
                  isActive
                    ? 'bg-primary/15'
                    : 'bg-transparent group-hover:bg-accent'
                )}>
                  <item.icon className={cn(
                    'h-[18px] w-[18px] transition-all duration-200',
                    isActive && 'scale-110'
                  )} />
                </div>
                {item.name}
                {item.href === '/chats' && unreadCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground shadow-sm shadow-destructive/20">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t p-3 space-y-2">
        {/* Online agents */}
        {otherOnlineAgents.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <div className="flex h-2 w-2 items-center justify-center">
              <span className="absolute h-2 w-2 animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative h-2 w-2 rounded-full bg-green-500" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {otherOnlineAgents.length} online
            </span>
            <div className="ml-auto flex -space-x-1.5">
              {otherOnlineAgents.slice(0, 3).map((agent) => (
                <div
                  key={agent.agent_id}
                  title={agent.full_name}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-primary/12 text-[10px] font-semibold text-primary"
                >
                  {agent.full_name.charAt(0).toUpperCase()}
                </div>
              ))}
              {otherOnlineAgents.length > 3 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-medium text-muted-foreground">
                  +{otherOnlineAgents.length - 3}
                </div>
              )}
            </div>
          </div>
        )}

        {/* User profile card */}
        <div className="rounded-xl bg-gradient-to-br from-muted/60 to-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
              {profile?.full_name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {profile?.full_name}
              </p>
              <p className="text-[11px] font-medium text-muted-foreground">
                {profile?.role === 'admin' ? 'Administrador' : 'Agente'}
              </p>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={async () => {
            const supabase = createClient()
            await supabase.auth.signOut()
            router.push('/login')
            router.refresh()
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-destructive/8 hover:text-destructive cursor-pointer"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
