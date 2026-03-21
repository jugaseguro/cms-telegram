'use client'

import { useTypingIndicator } from '@/hooks/use-typing'

interface TypingIndicatorProps {
  conversationId: string | null
}

export function TypingIndicator({ conversationId }: TypingIndicatorProps) {
  const { typingUsers } = useTypingIndicator(conversationId)

  if (typingUsers.length === 0) return null

  const names = typingUsers.map((u) => u.userName)
  const text =
    names.length === 1
      ? `${names[0]} está escribiendo`
      : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]} están escribiendo`

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground animate-pulse">
      <div className="flex gap-0.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
      </div>
      <span>{text}...</span>
    </div>
  )
}
