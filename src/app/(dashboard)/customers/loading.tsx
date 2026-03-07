import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function CustomersLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-32 animate-pulse rounded bg-primary/10" />
      <TableSkeleton columns={7} />
    </div>
  )
}
