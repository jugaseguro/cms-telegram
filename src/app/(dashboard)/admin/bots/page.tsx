import { Suspense } from 'react'
import { BotsContent } from '@/components/admin/bots-content'
import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function BotsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TableSkeleton columns={5} />}>
        <BotsContent />
      </Suspense>
    </div>
  )
}
