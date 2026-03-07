'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { AutoResponse } from '@/lib/supabase/types'

const supabase = createClient()

interface AutoResponseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: AutoResponse | null
}

interface FormData {
  trigger_text: string
  response_text: string
  shortcut: string
}

export function AutoResponseDialog({
  open,
  onOpenChange,
  editing,
}: AutoResponseDialogProps) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>()

  useEffect(() => {
    if (open) {
      reset({
        trigger_text: editing?.trigger_text ?? '',
        response_text: editing?.response_text ?? '',
        shortcut: editing?.shortcut ?? '',
      })
    }
  }, [open, editing, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        trigger_text: data.trigger_text,
        response_text: data.response_text,
        shortcut: data.shortcut?.trim() || null,
      }
      if (editing) {
        const { error } = await supabase
          .from('auto_responses')
          .update(payload)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('auto_responses')
          .insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Respuesta actualizada' : 'Respuesta creada')
      queryClient.invalidateQueries({ queryKey: ['auto-responses'] })
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error('Error: ' + err.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Editar respuesta' : 'Nueva respuesta automática'}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="trigger_text">
              Pregunta / Palabra clave
            </Label>
            <Input
              id="trigger_text"
              placeholder="ej: precio, horario, como pago"
              {...register('trigger_text', { required: 'Campo requerido' })}
            />
            {errors.trigger_text && (
              <p className="text-sm text-destructive">
                {errors.trigger_text.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="shortcut">
              Atajo (opcional)
            </Label>
            <Input
              id="shortcut"
              placeholder="ej: cbu, precio, hola"
              {...register('shortcut')}
            />
            <p className="text-xs text-muted-foreground">
              Escribe /{'{atajo}'} en el chat para insertar esta respuesta
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="response_text">
              Respuesta automática
            </Label>
            <Textarea
              id="response_text"
              placeholder="ej: Nuestros precios son..."
              rows={4}
              {...register('response_text', { required: 'Campo requerido' })}
            />
            {errors.response_text && (
              <p className="text-sm text-destructive">
                {errors.response_text.message}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? 'Guardando...'
                : editing
                ? 'Actualizar'
                : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
