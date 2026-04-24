'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BotFormDialog } from '@/components/admin/bot-form-dialog'
import { format } from 'date-fns'
import { Plus, Pencil, Power, PowerOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { QueryError } from '@/components/ui/query-error'
import type { BotPublic } from '@/lib/supabase/types'

export function BotsContent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBot, setEditBot] = useState<BotPublic | null>(null)
  const queryClient = useQueryClient()
  const isInitialized = useAuthStore((s) => s.isInitialized)

  const { data: bots, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-bots'],
    enabled: isInitialized,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('bots')
        .select('id, name, telegram_username, is_active, is_paused, color, welcome_message, created_at')
        .order('created_at')
      if (error) throw error
      return data as BotPublic[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/bots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Error al eliminar')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bots'] })
      queryClient.invalidateQueries({ queryKey: ['bots'] })
      toast.success('Bot eliminado')
    },
    onError: () => {
      toast.error('Error al eliminar el bot')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active, is_paused }: { id: string; is_active?: boolean; is_paused?: boolean }) => {
      const payload: any = { id }
      if (is_active !== undefined) payload.is_active = is_active
      if (is_paused !== undefined) payload.is_paused = is_paused

      const res = await fetch('/api/bots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Error al actualizar')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bots'] })
      queryClient.invalidateQueries({ queryKey: ['bots'] })
      toast.success('Bot actualizado')
    },
    onError: () => {
      toast.error('Error al actualizar el bot')
    },
  })

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestión de bots</h1>
        <Button
          onClick={() => {
            setEditBot(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Agregar bot
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Color</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={6}>
                  <QueryError onRetry={refetch} />
                </TableCell>
              </TableRow>
            )}
            {bots?.map((bot) => (
              <TableRow key={bot.id}>
                <TableCell>
                  <span
                    className="inline-block h-4 w-4 rounded-full"
                    style={{ backgroundColor: bot.color }}
                  />
                </TableCell>
                <TableCell className="font-medium">{bot.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {bot.telegram_username ? `@${bot.telegram_username}` : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Badge variant={bot.is_active ? 'default' : 'secondary'}>
                      {bot.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    {bot.is_paused && (
                      <Badge variant="destructive">Pausado</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {format(new Date(bot.created_at), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditBot(bot)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={bot.is_paused ? 'Reanudar bot' : 'Pausar bot'}
                      onClick={() =>
                        toggleMutation.mutate({
                          id: bot.id,
                          is_paused: !bot.is_paused,
                        })
                      }
                    >
                      {bot.is_paused ? (
                        <Power className="h-4 w-4 text-green-500" />
                      ) : (
                        <PowerOff className="h-4 w-4 text-orange-500" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={bot.is_active ? 'Desactivar bot' : 'Activar bot'}
                      onClick={() =>
                        toggleMutation.mutate({
                          id: bot.id,
                          is_active: !bot.is_active,
                        })
                      }
                    >
                      {bot.is_active ? (
                        <PowerOff className="h-4 w-4 text-destructive" />
                      ) : (
                        <Power className="h-4 w-4 text-green-500" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('¿Estás seguro de eliminar este bot? Se borrarán todos sus datos asociados.')) {
                          deleteMutation.mutate(bot.id)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && (!bots || bots.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No hay bots configurados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <BotFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editBot={editBot}
      />
    </>
  )
}
