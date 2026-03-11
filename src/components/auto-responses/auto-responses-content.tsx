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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AutoResponseDialog } from './auto-response-dialog'
import { useAuthStore } from '@/stores/auth-store'
import type { AutoResponse } from '@/lib/supabase/types'

const supabase = createClient()

export function AutoResponsesContent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AutoResponse | null>(null)
  const queryClient = useQueryClient()
  const isInitialized = useAuthStore((s) => s.isInitialized)

  const { data: responses, isLoading } = useQuery({
    queryKey: ['auto-responses'],
    enabled: isInitialized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auto_responses')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as AutoResponse[]
    },
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('auto_responses')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-responses'] })
    },
  })

  const deleteResponse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('auto_responses')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Respuesta eliminada')
      queryClient.invalidateQueries({ queryKey: ['auto-responses'] })
    },
  })

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Respuestas automáticas</h1>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nueva respuesta
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pregunta / Disparador</TableHead>
              <TableHead>Atajo</TableHead>
              <TableHead>Respuesta</TableHead>
              <TableHead>Activa</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {responses?.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No hay respuestas automáticas configuradas
                </TableCell>
              </TableRow>
            )}
            {responses?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-[250px] font-medium">
                  <p className="truncate">{r.trigger_text}</p>
                </TableCell>
                <TableCell>
                  {r.shortcut && (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      /{r.shortcut}
                    </code>
                  )}
                </TableCell>
                <TableCell className="max-w-[350px]">
                  <p className="truncate text-muted-foreground">
                    {r.response_text}
                  </p>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(checked) =>
                      toggleActive.mutate({ id: r.id, is_active: checked })
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(r)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteResponse.mutate(r.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AutoResponseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </>
  )
}
