'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useQuery } from '@tanstack/react-query'
import { useLabels } from '@/hooks/use-labels'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBotStore } from '@/stores/bot-store'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function MassMessageDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [selectedLabel, setSelectedLabel] = useState<string>('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const selectedBotIdGlobal = useBotStore((s) => s.selectedBotId)
  const bots = useBotStore((s) => s.bots)
  const [localBotId, setLocalBotId] = useState<string>('')

  // Sync localBotId with global when global changes
  useEffect(() => {
    if (selectedBotIdGlobal) {
      setLocalBotId(selectedBotIdGlobal)
    } else if (bots.length > 0 && !localBotId) {
      // If global is null (All bots), default to the first one so at least one is selected
      setLocalBotId(bots[0].id)
    }
  }, [selectedBotIdGlobal, bots])
  
  const { data: labels, isLoading: isLoadingLabels } = useLabels()
  
  const { data: estCount } = useQuery({
    queryKey: ['customer_count_by_label_conv', selectedLabel, localBotId],
    enabled: !!selectedLabel && !!localBotId,
    queryFn: async () => {
      const supabase = createClient()

      // Step 1: get all conversation_ids with this label
      const { data: convLabels, error: convLabelsError } = await supabase
        .from('conversation_labels')
        .select('conversation_id')
        .eq('label_id', selectedLabel)

      if (convLabelsError || !convLabels || convLabels.length === 0) return 0

      const convIds = convLabels.map((r) => r.conversation_id)

      // Step 2: get distinct customer_ids from those conversations filtered by bot
      const { data: convs, error: convsError } = await supabase
        .from('conversations')
        .select('customer_id')
        .in('id', convIds)
        .eq('bot_id', localBotId)

      if (convsError || !convs) return 0

      // Deduplicate customers (one customer can have multiple conversations)
      const uniqueCustomers = new Set(convs.map((c) => c.customer_id))
      return uniqueCustomers.size
    }
  })

  async function handleSend() {
    if (!selectedLabel) {
      toast.error('Selecciona una etiqueta')
      return
    }
    if (!message.trim()) {
      toast.error('El mensaje no puede estar vacío')
      return
    }
    if (!localBotId) {
      toast.error('Selecciona el Bot desde el cual enviarás el mensaje')
      return
    }

    if (!confirm(`Estás a punto de enviar este mensaje a aproximadamente ${estCount || 0} usuarios. ¿Continuar?`)) {
      return
    }

    setIsSending(true)
    try {
      const res = await fetch('/api/telegram/mass-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: localBotId,
          labelId: selectedLabel,
          text: message.trim(),
          messageType: 'text'
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error?.message || 'Error al enviar de forma masiva')
      }

      toast.success(
        `Envío completado: ${result.data?.sent || 0} enviados, ${result.data?.failed || 0} fallados.`
      )
      onOpenChange(false)
      setMessage('')
      setSelectedLabel('')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Ocurrió un error inesperado al enviar el mensaje masivo')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Mandar Mensaje Masivo</DialogTitle>
          <DialogDescription>
            Envía el mismo mensaje a todos los clientes que compartan una cierta etiqueta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <span className="text-sm font-medium">Bot de origen</span>
            <Select 
              value={localBotId} 
              onValueChange={(v) => setLocalBotId(v || '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar bot">
                  {bots.find(b => b.id === localBotId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {bots.map(bot => (
                  <SelectItem key={bot.id} value={bot.id}>
                    {bot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">Etiqueta destino</span>
            <Select 
              value={selectedLabel} 
              onValueChange={(val) => setSelectedLabel(val || '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoadingLabels ? "Cargando..." : "Seleccionar etiqueta"}>
                  {labels?.find(l => l.id === selectedLabel)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {labels?.map(label => (
                  <SelectItem key={label.id} value={label.id}>
                    {label.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {estCount !== undefined && selectedLabel && (
              <span className="text-xs text-muted-foreground ml-1">
                Aprox. {estCount} clientes recibirán este mensaje.
              </span>
            )}
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">Mensaje</span>
            <Textarea
              placeholder="Escribe el mensaje..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="resize-none min-h-[120px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={isSending || !selectedLabel || !message.trim()}>
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar masivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
