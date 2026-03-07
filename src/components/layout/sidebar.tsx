'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
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
  const { profile } = useAuthStore()

  const allNav = useMemo(() => [
    ...navigation,
    ...(profile?.role === 'admin' ? adminNavigation : []),
  ], [profile?.role])

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card/80 backdrop-blur-sm">
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
          <MessageSquare className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold tracking-tight">CRM Telegram</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {allNav.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/12 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.name}
            </Link>
          )
        })}
      </nav>
      <div className="border-t p-4">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            {profile?.role === 'admin' ? 'Administrador' : 'Agente'}
          </p>
          <p className="truncate text-sm font-medium">
            {profile?.full_name}
          </p>
        </div>
      </div>
    </aside>
  )
}
