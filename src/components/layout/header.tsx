'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, ChevronDown, Sun, Moon } from 'lucide-react'

const supabase = createClient()

export function Header() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??'

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card/60 px-6 backdrop-blur-sm">
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground hover:shadow-sm cursor-pointer"
        title="Cambiar tema"
      >
        <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-transform duration-300 dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-transform duration-300 dark:rotate-0 dark:scale-100" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 transition-all duration-200 hover:bg-accent/80 hover:shadow-sm outline-none cursor-pointer">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">
            {profile?.full_name}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
