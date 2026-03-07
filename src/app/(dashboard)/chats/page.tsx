import { Suspense } from 'react'
import { ChatsContent } from '@/components/chats/chats-content'
import { ChatsSkeleton } from '@/components/ui/page-skeleton'

export default function ChatsPage() {
  return (
    <Suspense fallback={<ChatsSkeleton />}>
      <ChatsContent />
    </Suspense>
  )
}
