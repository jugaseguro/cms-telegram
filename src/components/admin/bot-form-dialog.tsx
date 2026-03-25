'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { BotPublic } from '@/lib/supabase/types'

const BOT_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

const schema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  token: z.string().optional(),
  telegram_username: z.string().optional(),
  color: z.string(),
  welcome_message: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface BotFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editBot?: BotPublic | null
}

export function BotFormDialog({
  open,
  onOpenChange,
  editBot,
}: BotFormDialogProps) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      token: '',
      telegram_username: '',
      color: '#3b82f6',
      welcome_message: '',
    },
  })

  const selectedColor = watch('color')

  useEffect(() => {
    if (open) {
      if (editBot) {
        reset({
          name: editBot.name,
          token: '',
          telegram_username: editBot.telegram_username || '',
          color: editBot.color,
          welcome_message: editBot.welcome_message || '',
        })
      } else {
        reset({
          name: '',
          token: '',
          telegram_username: '',
          color: '#3b82f6',
          welcome_message: '',
        })
      }
    }
  }, [open, editBot, reset])

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || 'Error al crear bot')
      }
    },
    onSuccess: () => {
      toast.success('Bot creado exitosamente')
      queryClient.invalidateQueries({ queryKey: ['admin-bots'] })
      queryClient.invalidateQueries({ queryKey: ['bots'] })
      reset()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!editBot) return
      const body: Record<string, unknown> = {
        id: editBot.id,
        name: data.name,
        telegram_username: data.telegram_username || null,
        color: data.color,
        welcome_message: data.welcome_message || null,
      }
      // Only include token if changed
      if (data.token) {
        body.token = data.token
      }
      const res = await fetch('/api/bots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || 'Error al actualizar')
      }
    },
    onSuccess: () => {
      toast.success('Bot actualizado')
      queryClient.invalidateQueries({ queryKey: ['admin-bots'] })
      queryClient.invalidateQueries({ queryKey: ['bots'] })
      reset()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err.message),
  })

  function onSubmit(data: FormData) {
    if (editBot) {
      updateMutation.mutate(data)
    } else {
      if (!data.token || data.token.length < 10) {
        toast.error('Token de Telegram es requerido')
        return
      }
      createMutation.mutate(data)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editBot ? 'Editar bot' : 'Agregar bot'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" placeholder="Ej: Bot Ventas AR" {...register('name')} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {!editBot && (
            <div className="space-y-2">
              <Label htmlFor="token">Token de Telegram</Label>
              <Input
                id="token"
                type="password"
                placeholder="Pegar token de @BotFather"
                {...register('token')}
              />
              {errors.token && (
                <p className="text-sm text-destructive">{errors.token.message}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="telegram_username">Username (opcional)</Label>
            <Input
              id="telegram_username"
              placeholder="mi_bot"
              {...register('telegram_username')}
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {BOT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue('color', c)}
                  className={`h-8 w-8 rounded-full transition-all ${
                    selectedColor === c
                      ? 'ring-2 ring-offset-2 ring-primary scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcome_message">
              Mensaje de bienvenida <span className="text-muted-foreground">(cuando el usuario envía /start)</span>
            </Label>
            <Textarea
              id="welcome_message"
              rows={5}
              placeholder={"¡Bienvenido! 👋\n\nEscribí tu consulta y te respondemos enseguida."}
              {...register('welcome_message')}
            />
            <p className="text-xs text-muted-foreground">
              Si está vacío se usará un mensaje genérico por defecto.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editBot ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
