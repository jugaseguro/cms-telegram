import { CardsSkeleton } from '@/components/ui/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <CardsSkeleton />
    </div>
  )
}
