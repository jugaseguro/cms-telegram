import { Suspense } from 'react'
import { TransactionsContent } from '@/components/transactions/transactions-content'
import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TableSkeleton columns={7} />}>
        <TransactionsContent />
      </Suspense>
    </div>
  )
}
