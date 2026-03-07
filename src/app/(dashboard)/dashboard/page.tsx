import { Suspense } from 'react'
import { DashboardContent } from '@/components/dashboard/dashboard-content'
import { CardsSkeleton } from '@/components/ui/page-skeleton'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <Suspense fallback={<CardsSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}
