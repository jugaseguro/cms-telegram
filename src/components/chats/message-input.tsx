'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useSendMessage } from '@/hooks/use-messages'
import { useAuthStore } from '@/stores/auth-store'
import { Send, Paperclip, Loader2, Lock, MessageSquare, X, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useEmitTyping } from '@/hooks/use-typing'
import { QuickRepliesPopover } from './quick-replies-popover'
import { SlashCommandMenu } from './slash-command-menu'
import NextImage from 'next/image'
import type { AutoResponse } from '@/lib/supabase/types'

interface MessageInputProps {
  conversationId: string
}

export function MessageInput({ conversationId }: MessageInputProps) {
  const [text, setText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { user } = useAuthStore()
  const sendMessage = useSendMessage()
  const { emitTyping, stopTyping } = useEmitTyping(conversationId, user?.user_metadata?.full_name || 'Agente')

  const trackRateLimit = useCallback((remaining: number | null) => {
    setRateLimitRemaining(remaining)
    if (remaining !== null && remaining <= 0) {
      // Reset the counter after 60 seconds
      setTimeout(() => setRateLimitRemaining(null), 60_000)
    }
  }, [])

  const isInitialized = useAuthStore((s) => s.isInitialized)

  const { data: autoResponses } = useQuery({
    queryKey: ['auto-responses-active'],
    enabled: isInitialized,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('auto_responses')
        .select('id, trigger_text, response_text, shortcut, is_active')
        .eq('is_active', true)
        .order('trigger_text')
      if (error) throw error
      return data as AutoResponse[]
    },
  })

  async function handleSend() {
    if (!user) return
    stopTyping()

    if (pendingFile) {
      await uploadAndSend(pendingFile)
      return
    }

    if (!text.trim()) return

    const content = text.trim()
    setText('')
    sendMessage.mutate(
      {
        conversationId,
        content,
        senderId: user.id,
        isInternal,
      },
      {
        onError: (err) => {
          setText(content)
          if (err.message.startsWith('Rate limit')) {
            toast.error(err.message)
            trackRateLimit(0)
          } else {
            toast.error('Error al enviar: ' + err.message)
          }
        },
      }
    )
  }

  async function uploadAndSend(file: File) {
    if (!user) return
    setUploading(true)
    const supabase = createClient()

    try {
      const ext = file.name.split('.').pop()
      const path = `attachments/${conversationId}/${Date.now()}.${ext}`

      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file)

      if (error) {
        toast.error('Error al subir archivo')
        return
      }

      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(data.path)

      const isImage = file.type.startsWith('image/')
      sendMessage.mutate(
        {
          conversationId,
          content: isImage ? text.trim() : (text.trim() || file.name),
          senderId: user.id,
          messageType: isImage ? 'image' : 'document',
          mediaUrl: urlData.publicUrl,
        },
        {
          onSuccess: () => {
            setText('')
            clearPendingFile()
          },
          onError: (err) => toast.error('Error al enviar: ' + err.message),
        }
      )
    } finally {
      setUploading(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setPendingFile(file)

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }

    if (fileRef.current) fileRef.current.value = ''
  }

  function clearPendingFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPendingFile(null)
    setPreviewUrl(null)
  }

  function handleTextChange(value: string) {
    setText(value)
    if (value.length > 0) emitTyping()
    // Detect "/" at start of input
    if (value.startsWith('/')) {
      setShowSlashMenu(true)
      setSlashQuery(value.slice(1))
    } else {
      setShowSlashMenu(false)
      setSlashQuery('')
    }
  }

  function handleSlashSelect(responseText: string) {
    setText(responseText)
    setShowSlashMenu(false)
    setSlashQuery('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showSlashMenu) return // let SlashCommandMenu handle keys
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isSending = uploading

  return (
    <div className="border-t bg-card/60 backdrop-blur-sm">
      {/* Rate limit warning */}
      {rateLimitRemaining !== null && rateLimitRemaining <= 5 && (
        <div className={cn(
          'flex items-center gap-2 px-4 py-2 text-sm',
          rateLimitRemaining <= 0
            ? 'bg-destructive/10 text-destructive'
            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
        )}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {rateLimitRemaining <= 0
            ? 'Límite alcanzado. Esperá un momento antes de enviar más mensajes.'
            : `Quedan ${rateLimitRemaining} mensajes disponibles este minuto.`
          }
        </div>
      )}
      {/* Tabs: Mensaje / Nota interna */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => { setIsInternal(false); if (pendingFile && isInternal) clearPendingFile() }}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
            !isInternal
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Mensaje
        </button>
        <button
          type="button"
          onClick={() => { setIsInternal(true); if (pendingFile) clearPendingFile() }}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
            isInternal
              ? 'border-b-2 border-amber-500 text-amber-700 dark:text-amber-400'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Lock className="h-3.5 w-3.5" />
          Nota interna
        </button>
      </div>
      {pendingFile && (
        <div className="flex items-start gap-3 border-b bg-muted/50 px-4 py-3">
          {previewUrl ? (
            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border">
              <NextImage
                src={previewUrl}
                alt="Vista previa"
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">
              {pendingFile.name.split('.').pop()?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{pendingFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(pendingFile.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={clearPendingFile}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className={cn(
        'relative flex items-end gap-2 p-4',
        isInternal && 'bg-amber-50 dark:bg-amber-950/30'
      )}>
        {showSlashMenu && autoResponses && (
          <SlashCommandMenu
            query={slashQuery}
            responses={autoResponses}
            onSelect={handleSlashSelect}
            onClose={() => setShowSlashMenu(false)}
          />
        )}
        {!isInternal && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,.pdf,.doc,.docx"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileRef.current?.click()}
              disabled={isSending}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <QuickRepliesPopover onSelect={(reply) => setText(reply)} />
          </>
        )}
        <Textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isInternal ? 'Escribe una nota interna...' : pendingFile ? 'Agrega un mensaje (opcional)...' : 'Escribe un mensaje... (/ para atajos)'}
          className={cn(
            'min-h-[40px] max-h-[120px] resize-none',
            isInternal && 'border-amber-300 dark:border-amber-700'
          )}
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={(!text.trim() && !pendingFile) || isSending}
          size="icon"
          className="rounded-xl h-10 w-10 shadow-sm shadow-primary/20 transition-all duration-200 hover:shadow-md hover:shadow-primary/25"
        >
          {isSending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  )
}
