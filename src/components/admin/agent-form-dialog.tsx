'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { Profile } from '@/lib/supabase/types'

const schema = z.object({
  email: z.string().email('Email inválido'),
  full_name: z.string().min(2, 'Nombre requerido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  role: z.enum(['admin', 'agent']),
})

type FormData = z.infer<typeof schema>

interface AgentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editAgent?: Profile | null
}

const supabase = createClient()

export function AgentFormDialog({
  open,
  onOpenChange,
  editAgent,
}: AgentFormDialogProps) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: editAgent
      ? {
          email: editAgent.email,
          full_name: editAgent.full_name,
          role: editAgent.role,
          password: '',
        }
      : { role: 'agent' },
  })

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Use Supabase Admin API via edge function or server action
      // For now, use signUp (in production, use admin API)
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.full_name,
            role: data.role,
          },
        },
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Agente creado exitosamente')
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      reset()
      onOpenChange(false)
    },
    onError: (err) => toast.error('Error: ' + err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!editAgent) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('profiles')
        .update({
          full_name: data.full_name,
          role: data.role,
        })
        .eq('id', editAgent.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Agente actualizado')
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      reset()
      onOpenChange(false)
    },
    onError: (err) => toast.error('Error: ' + err.message),
  })

  function onSubmit(data: FormData) {
    if (editAgent) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editAgent ? 'Editar agente' : 'Crear agente'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              disabled={!!editAgent}
            />
            {errors.email && (
              <p className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">Nombre completo</Label>
            <Input id="full_name" {...register('full_name')} />
            {errors.full_name && (
              <p className="text-sm text-destructive">
                {errors.full_name.message}
              </p>
            )}
          </div>

          {!editAgent && (
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Rol</Label>
            <select
              defaultValue={editAgent?.role ?? 'agent'}
              onChange={(e) => setValue('role', e.target.value as 'admin' | 'agent')}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="agent">Agente</option>
              <option value="admin">Admin</option>
            </select>
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
              {editAgent ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
