import { TableSkeleton } from '@/components/ui/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function AutoResponsesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-40" />
      </div>
      <TableSkeleton columns={4} />
    </div>
  )
}
