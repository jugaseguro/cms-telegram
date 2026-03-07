import { Suspense } from 'react'
import { AutoResponsesContent } from '@/components/auto-responses/auto-responses-content'
import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function AutoResponsesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TableSkeleton columns={4} />}>
        <AutoResponsesContent />
      </Suspense>
    </div>
  )
}
