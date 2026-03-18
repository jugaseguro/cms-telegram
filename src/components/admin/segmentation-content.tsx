'use client'

import { useState } from 'react'
import {
  useSegmentationRules,
  useSegmentationLogs,
  useCreateSegmentationRule,
  useUpdateSegmentationRule,
  useDeleteSegmentationRule,
  useToggleSegmentationRule,
} from '@/hooks/use-segmentation'
import { useLabels } from '@/hooks/use-labels'
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
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Plus, Pencil, Trash2, X, CircleDollarSign, Clock, Hash, TrendingUp, UserCheck, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type {
  SegmentationRuleWithLabel,
  SegmentationCondition,
  SegmentationConditionField,
  SegmentationConditionOperator,
} from '@/lib/supabase/types'

// ── Human-friendly config ──────────────────────────────────

const fieldConfig: Record<SegmentationConditionField, {
  label: string
  icon: React.ReactNode
  unit?: string
  description: string
}> = {
  transaction_count: {
    label: 'Cantidad de cargas',
    icon: <Hash className="h-3.5 w-3.5" />,
    unit: 'cargas',
    description: 'Total de cargas confirmadas del cliente',
  },
  total_amount: {
    label: 'Monto total cargado',
    icon: <CircleDollarSign className="h-3.5 w-3.5" />,
    unit: 'ARS',
    description: 'Suma total de todas las cargas confirmadas',
  },
  avg_amount: {
    label: 'Promedio por carga',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    unit: 'ARS',
    description: 'Monto promedio de cada carga',
  },
  inactive_days: {
    label: 'Días sin actividad',
    icon: <Clock className="h-3.5 w-3.5" />,
    unit: 'días',
    description: 'Tiempo desde la última interacción',
  },
  has_paid: {
    label: 'Ha realizado carga',
    icon: <UserCheck className="h-3.5 w-3.5" />,
    description: 'Si el cliente tiene al menos una carga confirmada',
  },
  status: {
    label: 'Estado del cliente',
    icon: <Activity className="h-3.5 w-3.5" />,
    description: 'Estado actual del cliente en el sistema',
  },
  days_since_first_tx: {
    label: 'Antigüedad como cliente',
    icon: <Clock className="h-3.5 w-3.5" />,
    unit: 'días',
    description: 'Días desde su primera carga',
  },
}

const operatorLabelsHuman: Record<SegmentationConditionOperator, string> = {
  eq: 'es igual a',
  neq: 'es diferente de',
  gt: 'es mayor que',
  gte: 'es al menos',
  lt: 'es menor que',
  lte: 'es como máximo',
}

function getOperatorsForField(field: SegmentationConditionField): SegmentationConditionOperator[] {
  if (field === 'has_paid') return ['eq']
  if (field === 'status') return ['eq', 'neq']
  return ['gte', 'gt', 'lte', 'lt', 'eq', 'neq']
}

function summarizeCondition(c: SegmentationCondition): string {
  const cfg = fieldConfig[c.field]
  const op = operatorLabelsHuman[c.operator] ?? c.operator

  if (c.field === 'has_paid') {
    return c.value === true ? 'Ha realizado cargas' : 'No ha realizado cargas'
  }
  if (c.field === 'status') {
    const statusMap: Record<string, string> = { new: 'Nuevo', active: 'Activo', inactive: 'Inactivo' }
    return `Estado ${op} ${statusMap[String(c.value)] ?? c.value}`
  }

  const unit = cfg.unit ? ` ${cfg.unit}` : ''
  return `${cfg.label} ${op} ${c.value}${unit}`
}

function summarizeConditions(conditions: SegmentationCondition[]): string {
  if (!conditions?.length) return 'Sin condiciones'
  return conditions.map(summarizeCondition).join(' y ')
}

// ── Form state ─────────────────────────────────────────────

interface FormState {
  name: string
  description: string
  label_id: string
  conditions: SegmentationCondition[]
  auto_remove: boolean
}

const emptyForm: FormState = {
  name: '',
  description: '',
  label_id: '',
  conditions: [{ field: 'transaction_count', operator: 'gte', value: 5 }],
  auto_remove: false,
}

// ── Main component ─────────────────────────────────────────

export function SegmentationContent() {
  const { data: rules, isLoading, isError, refetch } = useSegmentationRules()
  const { data: logs } = useSegmentationLogs()
  const { data: labels } = useLabels()
  const createMutation = useCreateSegmentationRule()
  const updateMutation = useUpdateSegmentationRule()
  const deleteMutation = useDeleteSegmentationRule()
  const toggleMutation = useToggleSegmentationRule()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SegmentationRuleWithLabel | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(rule: SegmentationRuleWithLabel) {
    setEditing(rule)
    setForm({
      name: rule.name,
      description: rule.description ?? '',
      label_id: rule.label_id,
      conditions: rule.conditions?.length ? rule.conditions : [{ field: 'transaction_count', operator: 'gte', value: 5 }],
      auto_remove: rule.auto_remove,
    })
    setDialogOpen(true)
  }

  function addCondition() {
    setForm((f) => ({
      ...f,
      conditions: [...f.conditions, { field: 'transaction_count', operator: 'gte', value: 0 }],
    }))
  }

  function removeCondition(index: number) {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.filter((_, i) => i !== index),
    }))
  }

  function updateCondition(index: number, updates: Partial<SegmentationCondition>) {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)),
    }))
  }

  function handleSave() {
    if (!form.name || !form.label_id || !form.conditions.length) {
      toast.error('Completa todos los campos requeridos')
      return
    }

    const payload = {
      name: form.name,
      description: form.description || null,
      label_id: form.label_id,
      conditions: form.conditions,
      auto_remove: form.auto_remove,
      bot_id: null,
    }

    if (editing) {
      updateMutation.mutate(
        { id: editing.id, ...payload },
        {
          onSuccess: () => {
            toast.success('Regla actualizada')
            setDialogOpen(false)
          },
          onError: (err) => toast.error('Error: ' + err.message),
        }
      )
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success('Regla creada')
          setDialogOpen(false)
        },
        onError: (err) => toast.error('Error: ' + err.message),
      })
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const selectedLabel = labels?.find((l) => l.id === form.label_id)

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Segmentación de clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Asigna etiquetas automáticamente a tus clientes según su comportamiento
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva regla
        </Button>
      </div>

      {/* Rules table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Regla</TableHead>
              <TableHead>Etiqueta</TableHead>
              <TableHead>Condiciones</TableHead>
              <TableHead>Auto-remover</TableHead>
              <TableHead>Activa</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
            {rules?.length === 0 && !isLoading && !isError && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <p className="text-muted-foreground">No hay reglas configuradas</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Crea una regla para etiquetar clientes automáticamente
                  </p>
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
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: rule.labels.color }}
                  >
                    {rule.labels.name}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="text-xs text-muted-foreground max-w-[300px]">
                    {summarizeConditions(rule.conditions)}
                  </p>
                </TableCell>
                <TableCell>
                  {rule.auto_remove ? (
                    <Badge variant="outline" className="text-[10px]">Sí</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">No</span>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: rule.id, is_active: checked })
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        deleteMutation.mutate(rule.id, {
                          onSuccess: () => toast.success('Regla eliminada'),
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

      {/* Logs */}
      {logs && logs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Últimas asignaciones automáticas</h2>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Regla</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.segmentation_rules?.name}
                    </TableCell>
                    <TableCell>
                      {[log.customers?.first_name, log.customers?.last_name]
                        .filter(Boolean)
                        .join(' ') ||
                        log.customers?.telegram_username ||
                        'Sin nombre'}
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: log.labels?.color }}
                      >
                        {log.labels?.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.action === 'assigned' ? 'default' : 'secondary'}>
                        {log.action === 'assigned' ? 'Asignada' : 'Removida'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground" suppressHydrationWarning>
                      {formatDistanceToNow(new Date(log.created_at), {
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

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar regla' : 'Nueva regla de segmentación'}
            </DialogTitle>
            <DialogDescription>
              Define las condiciones para etiquetar clientes automáticamente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="seg-name">Nombre de la regla</Label>
              <Input
                id="seg-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ej: Cliente VIP, Cliente frecuente, Inactivo..."
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="seg-desc">
                Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="seg-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="ej: Clientes con más de 5 cargas confirmadas"
              />
            </div>

            {/* Label selector */}
            <div className="space-y-1.5">
              <Label>Etiqueta que se asignará</Label>
              <Select
                value={form.label_id}
                onValueChange={(v) => { if (v) setForm((prev) => ({ ...prev, label_id: v })) }}
              >
                <SelectTrigger>
                  {selectedLabel ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: selectedLabel.color }}
                      />
                      {selectedLabel.name}
                    </span>
                  ) : (
                    <SelectValue placeholder="Elegir etiqueta..." />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {labels?.map((label) => (
                    <SelectItem key={label.id} value={label.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: label.color }}
                        />
                        {label.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {labels?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Primero crea etiquetas en Administración &rarr; Etiquetas
                </p>
              )}
            </div>

            {/* Conditions builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Condiciones</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    El cliente debe cumplir <strong>todas</strong> las condiciones
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="mr-1 h-3 w-3" />
                  Agregar
                </Button>
              </div>

              <div className="space-y-2">
                {form.conditions.map((condition, index) => (
                  <ConditionRow
                    key={index}
                    condition={condition}
                    index={index}
                    onChange={(updates) => updateCondition(index, updates)}
                    onRemove={() => removeCondition(index)}
                    canRemove={form.conditions.length > 1}
                  />
                ))}
              </div>

              {/* Live preview */}
              {form.conditions.length > 0 && (
                <div className="rounded-lg bg-muted/50 border border-dashed px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">Vista previa</p>
                  <p className="text-sm leading-relaxed">
                    {form.conditions.map((c, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-muted-foreground"> y </span>}
                        <span className="font-medium">{summarizeCondition(c)}</span>
                      </span>
                    ))}
                    {selectedLabel && (
                      <>
                        <span className="text-muted-foreground"> &rarr; </span>
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white align-middle"
                          style={{ backgroundColor: selectedLabel.color }}
                        >
                          {selectedLabel.name}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Auto-remove toggle */}
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Switch
                checked={form.auto_remove}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, auto_remove: checked }))}
                className="mt-0.5"
              />
              <div>
                <Label className="text-sm">Auto-remover etiqueta</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Si el cliente deja de cumplir las condiciones, se le quita la etiqueta automáticamente
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear regla'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Condition Row ──────────────────────────────────────────

const statusLabels: Record<string, string> = {
  new: 'Nuevo',
  active: 'Activo',
  inactive: 'Inactivo',
}

function ConditionRow({
  condition,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: SegmentationCondition
  index: number
  onChange: (updates: Partial<SegmentationCondition>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const operators = getOperatorsForField(condition.field)
  const cfg = fieldConfig[condition.field]

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2.5">
      {/* Row header: prefix + field selector + remove */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium shrink-0 w-4 text-center">
          {index === 0 ? 'Si' : 'Y'}
        </span>

        <Select
          value={condition.field}
          onValueChange={(v) => {
            if (!v) return
            const field = v as SegmentationConditionField
            const newOps = getOperatorsForField(field)
            const newOp = newOps.includes(condition.operator) ? condition.operator : newOps[0]
            const defaultValue = field === 'has_paid' ? true : field === 'status' ? 'active' : 0
            onChange({ field, operator: newOp, value: defaultValue })
          }}
        >
          <SelectTrigger className="flex-1">
            <span className="flex items-center gap-2">
              {cfg.icon}
              {cfg.label}
            </span>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(fieldConfig) as SegmentationConditionField[]).map((f) => (
              <SelectItem key={f} value={f}>
                <span className="flex items-center gap-2">
                  {fieldConfig[f].icon}
                  <span>
                    <span className="block">{fieldConfig[f].label}</span>
                    <span className="block text-[10px] text-muted-foreground">{fieldConfig[f].description}</span>
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canRemove && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Operator + Value */}
      <div className="flex items-center gap-2 pl-6">
        {condition.field === 'has_paid' ? (
          <Select
            value={String(condition.value)}
            onValueChange={(v) => { if (v) onChange({ value: v === 'true' }) }}
          >
            <SelectTrigger className="w-full">
              <span>{condition.value === true ? 'Sí, ha realizado cargas' : 'No ha realizado cargas'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Sí, ha realizado cargas</SelectItem>
              <SelectItem value="false">No ha realizado cargas</SelectItem>
            </SelectContent>
          </Select>
        ) : condition.field === 'status' ? (
          <>
            <Select
              value={condition.operator}
              onValueChange={(v) => { if (v) onChange({ operator: v as SegmentationConditionOperator }) }}
            >
              <SelectTrigger className="w-[150px]">
                <span>{operatorLabelsHuman[condition.operator]}</span>
              </SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op} value={op}>
                    {operatorLabelsHuman[op]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(condition.value)}
              onValueChange={(v) => { if (v) onChange({ value: v }) }}
            >
              <SelectTrigger className="flex-1">
                <span>{statusLabels[String(condition.value)] ?? String(condition.value)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Nuevo</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : (
          <>
            <Select
              value={condition.operator}
              onValueChange={(v) => { if (v) onChange({ operator: v as SegmentationConditionOperator }) }}
            >
              <SelectTrigger className="w-[170px]">
                <span>{operatorLabelsHuman[condition.operator]}</span>
              </SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op} value={op}>
                    {operatorLabelsHuman[op]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Input
                type="number"
                value={condition.value as number}
                onChange={(e) => onChange({ value: parseFloat(e.target.value) || 0 })}
                className={cfg.unit ? 'pr-14' : ''}
              />
              {cfg.unit && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  {cfg.unit}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
