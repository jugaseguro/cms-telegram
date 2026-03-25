'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { QueryError } from '@/components/ui/query-error'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useLabels } from '@/hooks/use-labels'
import { useAuthStore } from '@/stores/auth-store'
import type { RecontactRule, RecontactLog } from '@/lib/supabase/types'

const conditionLabels: Record<string, string> = {
  inactive_days: 'Inactivo (días)',
  no_payment: 'Sin pago',
  vip_inactive: 'VIP inactivo',
  by_label: 'Por etiqueta',
}

export function RecontactContent() {
  const queryClient = useQueryClient()
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const { data: allLabels } = useLabels()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RecontactRule | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    condition_type: 'inactive_days' as RecontactRule['condition_type'],
    condition_days: 7,
    condition_unit: 'days' as 'hours' | 'days',
    message_template: '',
    target_label_id: '' as string,
  })

  const { data: rules, isLoading, isError, refetch } = useQuery({
    queryKey: ['recontact-rules'],
    enabled: isInitialized,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('recontact_rules')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as RecontactRule[]
    },
  })

  const { data: logs } = useQuery({
    queryKey: ['recontact-logs'],
    enabled: isInitialized,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('recontact_logs')
        .select('*, customers(first_name, last_name, telegram_username), recontact_rules(name)')
        .order('sent_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as (RecontactLog & {
        customers: { first_name: string | null; last_name: string | null; telegram_username: string | null }
        recontact_rules: { name: string }
      })[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const supabase = createClient()
      const payload = {
        name: data.name,
        description: data.description || null,
        condition_type: data.condition_type,
        condition_days: data.condition_days,
        condition_unit: data.condition_unit,
        message_template: data.message_template,
        target_label_id: data.condition_type === 'by_label' && data.target_label_id
          ? data.target_label_id
          : null as string | null,
      }
      if (editing) {
        const { error } = await supabase
          .from('recontact_rules')
          .update(payload)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('recontact_rules')
          .insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Regla actualizada' : 'Regla creada')
      queryClient.invalidateQueries({ queryKey: ['recontact-rules'] })
      setDialogOpen(false)
    },
    onError: (err) => toast.error('Error: ' + err.message),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('recontact_rules')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recontact-rules'] })
    },
    onError: (err) => toast.error('Error: ' + err.message),
  })

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('recontact_rules')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Regla eliminada')
      queryClient.invalidateQueries({ queryKey: ['recontact-rules'] })
    },
    onError: (err) => toast.error('Error: ' + err.message),
  })

  function openCreate() {
    setEditing(null)
    setForm({
      name: '',
      description: '',
      condition_type: 'inactive_days',
      condition_days: 7,
      condition_unit: 'days',
      message_template: '',
      target_label_id: '',
    })
    setDialogOpen(true)
  }

  function openEdit(rule: RecontactRule) {
    setEditing(rule)
    setForm({
      name: rule.name,
      description: rule.description ?? '',
      condition_type: rule.condition_type,
      condition_days: rule.condition_days,
      condition_unit: rule.condition_unit ?? 'days',
      message_template: rule.message_template,
      target_label_id: rule.target_label_id ?? '',
    })
    setDialogOpen(true)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recontacto automático</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva regla
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Condición</TableHead>
              <TableHead>Tiempo</TableHead>
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
            {isError && (
              <TableRow>
                <TableCell colSpan={5}>
                  <QueryError onRetry={refetch} />
                </TableCell>
              </TableRow>
            )}
            {rules?.length === 0 && !isLoading && !isError && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No hay reglas de recontacto configuradas
                </TableCell>
              </TableRow>
            )}
            {rules?.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">
                  <div>
                    <p>{rule.name}</p>
                    {rule.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {rule.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {conditionLabels[rule.condition_type]}
                  </Badge>
                </TableCell>
                <TableCell>{rule.condition_days} {(rule.condition_unit ?? 'days') === 'hours' ? 'hs' : 'd'}</TableCell>
                <TableCell>
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(checked) =>
                      toggleActive.mutate({ id: rule.id, is_active: checked })
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(rule)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRule.mutate(rule.id)}
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

      {logs && logs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Últimos envíos</h2>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Regla</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Enviado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.recontact_rules?.name}
                    </TableCell>
                    <TableCell>
                      {[log.customers?.first_name, log.customers?.last_name]
                        .filter(Boolean)
                        .join(' ') ||
                        log.customers?.telegram_username ||
                        'Sin nombre'}
                    </TableCell>
                    <TableCell className="text-muted-foreground" suppressHydrationWarning>
                      {formatDistanceToNow(new Date(log.sent_at), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar regla' : 'Nueva regla de recontacto'}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveMutation.mutate(form)
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="rule-name">Nombre</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ej: Recordatorio semanal"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-description">Descripción (opcional)</Label>
              <Input
                id="rule-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="ej: Enviar a clientes inactivos"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de condición</Label>
                <Select
                  value={form.condition_type}
                  onValueChange={(v) => {
                      if (v) setForm((f) => ({ ...f, condition_type: v as RecontactRule['condition_type'] }))
                    }}
                >
                  <SelectTrigger>
                    <span>{conditionLabels[form.condition_type]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inactive_days">Inactivo (días)</SelectItem>
                    <SelectItem value="no_payment">Sin pago</SelectItem>
                    <SelectItem value="vip_inactive">VIP inactivo</SelectItem>
                    <SelectItem value="by_label">Por etiqueta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-days">Tiempo de inactividad</Label>
                <div className="flex gap-2">
                  <Input
                    id="rule-days"
                    type="number"
                    min={1}
                    value={form.condition_days}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, condition_days: parseInt(e.target.value) || 1 }))
                    }
                    className="w-20"
                  />
                  <Select
                    value={form.condition_unit}
                    onValueChange={(v) => {
                      if (v) setForm((f) => ({ ...f, condition_unit: v as 'hours' | 'days' }))
                    }}
                  >
                    <SelectTrigger className="w-24">
                      <span>{form.condition_unit === 'hours' ? 'Horas' : 'Días'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="days">Días</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {form.condition_type === 'by_label' && (
              <div className="space-y-2">
                <Label>Etiqueta objetivo</Label>
                <Select
                  value={allLabels?.some(l => l.id === form.target_label_id) ? form.target_label_id : undefined}
                  onValueChange={(v) => { if (v) setForm((prev) => ({ ...prev, target_label_id: v })) }}
                >
                  <SelectTrigger>
                    {(() => {
                      const selected = allLabels?.find(l => l.id === form.target_label_id)
                      return selected ? (
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full inline-block flex-shrink-0"
                            style={{ backgroundColor: selected.color }}
                          />
                          {selected.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Seleccionar etiqueta...</span>
                      )
                    })()}
                  </SelectTrigger>
                  <SelectContent>
                    {allLabels?.map((label) => (
                      <SelectItem key={label.id} value={label.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full inline-block"
                            style={{ backgroundColor: label.color }}
                          />
                          {label.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Enviar a clientes con esta etiqueta que estén inactivos por el tiempo configurado
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rule-template">Mensaje template</Label>
              <Textarea
                id="rule-template"
                rows={3}
                value={form.message_template}
                onChange={(e) => setForm((f) => ({ ...f, message_template: e.target.value }))}
                placeholder="Hola {{nombre}}, hace tiempo que no nos contactas..."
                required
              />
              <p className="text-xs text-muted-foreground">
                Usa {'{{nombre}}'} para insertar el nombre del cliente
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
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
