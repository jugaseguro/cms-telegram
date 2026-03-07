import { Suspense } from 'react'
import { RecontactContent } from '@/components/admin/recontact-content'
import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function RecontactPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TableSkeleton columns={5} />}>
        <RecontactContent />
      </Suspense>
    </div>
  )
}
