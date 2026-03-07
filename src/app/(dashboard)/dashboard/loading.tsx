import { CardsSkeleton } from '@/components/ui/page-skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 animate-pulse rounded bg-primary/10" />
      <CardsSkeleton />
    </div>
  )
}
