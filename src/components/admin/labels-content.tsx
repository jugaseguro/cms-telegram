'use client'

import { useState } from 'react'
import { useLabels, useCreateLabel, useUpdateLabel, useDeleteLabel } from '@/hooks/use-labels'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Label as LabelType } from '@/lib/supabase/types'

export function LabelsContent() {
  const { data: labels, isLoading } = useLabels()
  const createLabel = useCreateLabel()
  const updateLabel = useUpdateLabel()
  const deleteLabel = useDeleteLabel()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LabelType | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6b7280')

  function openCreate() {
    setEditing(null)
    setName('')
    setColor('#6b7280')
    setDialogOpen(true)
  }

  function openEdit(label: LabelType) {
    setEditing(label)
    setName(label.name)
    setColor(label.color)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    if (editing) {
      updateLabel.mutate(
        { id: editing.id, name: name.trim(), color },
        {
          onSuccess: () => {
            toast.success('Etiqueta actualizada')
            setDialogOpen(false)
          },
          onError: (err) => toast.error('Error: ' + err.message),
        }
      )
    } else {
      createLabel.mutate(
        { name: name.trim(), color },
        {
          onSuccess: () => {
            toast.success('Etiqueta creada')
            setDialogOpen(false)
          },
          onError: (err) => toast.error('Error: ' + err.message),
        }
      )
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Etiquetas</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva etiqueta
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Color</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {labels?.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No hay etiquetas configuradas
                </TableCell>
              </TableRow>
            )}
            {labels?.map((label) => (
              <TableRow key={label.id}>
                <TableCell>
                  <span
                    className="inline-block h-5 w-5 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                </TableCell>
                <TableCell className="font-medium">{label.name}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(label)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        deleteLabel.mutate(label.id, {
                          onSuccess: () => toast.success('Etiqueta eliminada'),
                          onError: (err) => toast.error('Error: ' + err.message),
                        })
                      }
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar etiqueta' : 'Nueva etiqueta'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label-name">Nombre</Label>
              <Input
                id="label-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: VIP, Urgente"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="label-color">Color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="label-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border p-1"
                />
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: color }}
                >
                  {name || 'Preview'}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createLabel.isPending || updateLabel.isPending}
              >
                {(createLabel.isPending || updateLabel.isPending)
                  ? 'Guardando...'
                  : editing
                    ? 'Actualizar'
                    : 'Crear'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
