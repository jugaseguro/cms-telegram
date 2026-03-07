import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function TransactionsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 animate-pulse rounded bg-primary/10" />
        <div className="h-9 w-36 animate-pulse rounded bg-primary/10" />
      </div>
      <TableSkeleton columns={7} />
    </div>
  )
}
