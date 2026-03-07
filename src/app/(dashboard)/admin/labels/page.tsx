import { Suspense } from 'react'
import { LabelsContent } from '@/components/admin/labels-content'
import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function LabelsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TableSkeleton columns={3} />}>
        <LabelsContent />
      </Suspense>
    </div>
  )
}
