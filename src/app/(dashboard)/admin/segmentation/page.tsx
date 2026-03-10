import { Suspense } from 'react'
import { SegmentationContent } from '@/components/admin/segmentation-content'
import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function SegmentationPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TableSkeleton columns={5} />}>
        <SegmentationContent />
      </Suspense>
    </div>
  )
}
