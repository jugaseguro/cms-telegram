import { Suspense } from 'react'
import { AiCostsContent } from '@/components/admin/ai-costs-content'
import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function AiCostsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TableSkeleton columns={6} />}>
        <AiCostsContent />
      </Suspense>
    </div>
  )
}
