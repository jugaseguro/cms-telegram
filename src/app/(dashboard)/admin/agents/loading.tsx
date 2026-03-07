import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function AgentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-52 animate-pulse rounded bg-primary/10" />
        <div className="h-9 w-32 animate-pulse rounded bg-primary/10" />
      </div>
      <TableSkeleton columns={5} />
    </div>
  )
}
