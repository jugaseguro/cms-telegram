'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { Message } from '@/lib/supabase/types'
import { FileText, Lock, Pencil, Trash2, Check, X, Clock } from 'lucide-react'
import { useUpdateMessage, useDeleteMessage } from '@/hooks/use-messages'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import NextImage from 'next/image'

// Parse HTML <a> tags and plain URLs into clickable links
function MessageContent({ content }: { content: string }) {
  // Split on HTML <a> tags, keeping the tags as separate parts
  const parts = content.split(/(<a\s+href="[^"]*">[^<]*<\/a>)/gi)

  return (
    <>
      {parts.map((part, i) => {
        // Check if this part is an HTML <a> tag
        const anchorMatch = part.match(/^<a\s+href="([^"]*)">(.*?)<\/a>$/i)
        if (anchorMatch) {
          return (
            <a key={i} href={anchorMatch[1]} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline hover:text-blue-700 break-all">
              {anchorMatch[2]}
            </a>
          )
        }
        // For plain text parts, also linkify bare URLs
        return <LinkifyText key={i} text={part} />
      })}
    </>
  )
}

function LinkifyText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)

  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline hover:text-blue-700 break-all">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

interface MessageBubbleProps {
  message: Message
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </button>
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <NextImage
          src={src}
          alt={alt}
          width={1200}
          height={900}
          className="max-h-[90vh] w-auto rounded-lg object-contain"
          unoptimized
        />
      </div>
    </div>
  )
}

function ClickableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <NextImage
        src={src}
        alt={alt}
        width={300}
        height={200}
        className={cn('cursor-pointer transition-opacity hover:opacity-90', className)}
        onClick={() => setOpen(true)}
        unoptimized
      />
      {open && <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isAgent = message.sender_type === 'agent'
  const isBot = message.sender_type === 'bot'
  const isInternal = message.is_internal
  const isOptimistic = message.id.startsWith('optimistic-')

  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.content || '')
  const editRef = useRef<HTMLTextAreaElement>(null)
  const updateMessage = useUpdateMessage()
  const deleteMessage = useDeleteMessage()

  function handleSaveEdit() {
    if (!editText.trim()) return
    updateMessage.mutate(
      { messageId: message.id, content: editText.trim(), conversationId: message.conversation_id },
      {
        onSuccess: () => setIsEditing(false),
        onError: (err) => toast.error('Error al editar: ' + err.message),
      }
    )
  }

  function handleDelete() {
    deleteMessage.mutate(
      { messageId: message.id, conversationId: message.conversation_id },
      { onError: (err) => toast.error('Error al eliminar: ' + err.message) }
    )
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    }
    if (e.key === 'Escape') {
      setIsEditing(false)
      setEditText(message.content || '')
    }
  }

  return (
    <div
      className={cn(
        'group flex',
        isAgent || isInternal ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Edit/delete actions — show on hover, before the bubble (right side) */}
      {isInternal && !isEditing && (
        <div className="mr-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => { setIsEditing(true); setEditText(message.content || '') }}
            title="Editar nota"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={deleteMessage.isPending}
            title="Eliminar nota"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm',
          isInternal
            ? 'bg-amber-50 text-amber-900 border border-amber-200/80 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-700/60'
            : isAgent
            ? 'bg-bubble-agent-bg text-bubble-agent-text shadow-primary/10 rounded-br-md'
            : isBot
            ? 'bg-bubble-bot-bg text-bubble-bot-text'
            : 'bg-bubble-customer-bg text-bubble-customer-text border border-border/60 rounded-bl-md'
        )}
      >
        {isInternal && (
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Lock className="h-3 w-3" />
            Nota interna
          </p>
        )}
        {!isInternal && message.sender_type !== 'agent' && (
          <p className="mb-1 text-xs font-medium opacity-70">
            {isBot ? 'Bot' : 'Cliente'}
          </p>
        )}

        {message.message_type === 'image' && message.media_url && (
          <div className="relative mb-1 max-h-48 w-fit overflow-hidden rounded-lg">
            <ClickableImage
              src={message.media_url}
              alt="Imagen"
              className="h-auto max-h-48 w-auto rounded-lg object-contain"
            />
          </div>
        )}

        {message.message_type === 'document' && (
          <div className="mb-1 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <a
              href={message.media_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              Documento adjunto
            </a>
          </div>
        )}

        {message.message_type === 'receipt' && message.media_url && (
          <div className="relative mb-1 w-fit overflow-hidden rounded-lg">
            <p className="mb-1 text-xs font-medium">Comprobante:</p>
            <ClickableImage
              src={message.media_url}
              alt="Comprobante"
              className="h-auto max-h-48 w-auto rounded-lg object-contain"
            />
          </div>
        )}

        {isEditing ? (
          <div className="flex flex-col gap-1.5">
            <Textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="min-h-[36px] max-h-[100px] resize-none border-amber-400 bg-white text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-100"
              rows={1}
              autoFocus
            />
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => { setIsEditing(false); setEditText(message.content || '') }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-amber-700 hover:text-amber-900 dark:text-amber-300"
                onClick={handleSaveEdit}
                disabled={updateMessage.isPending || !editText.trim()}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : message.content ? (
          <p className="whitespace-pre-wrap text-sm">
            <MessageContent content={message.content} />
          </p>
        ) : null}

        <p
          className={cn(
            'mt-1 text-right text-xs opacity-60',
            isInternal ? 'text-amber-600 dark:text-amber-400' : isAgent ? 'text-bubble-agent-text' : 'text-muted-foreground'
          )}
          suppressHydrationWarning
        >
          {isOptimistic ? (
            <Clock className="inline h-3 w-3" />
          ) : (
            format(new Date(message.created_at), 'HH:mm')
          )}
        </p>
      </div>
    </div>
  )
})
