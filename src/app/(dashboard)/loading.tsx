import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardGroupLoading() {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden w-64 flex-shrink-0 border-r bg-card md:block">
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="h-14 border-b px-6 flex items-center">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
