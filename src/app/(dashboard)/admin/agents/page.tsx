import { Suspense } from 'react'
import { AgentsContent } from '@/components/admin/agents-content'
import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TableSkeleton columns={5} />}>
        <AgentsContent />
      </Suspense>
    </div>
  )
}
