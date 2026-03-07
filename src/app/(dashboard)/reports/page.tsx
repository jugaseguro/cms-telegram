import { Suspense } from 'react'
import { ReportsContent } from '@/components/reports/reports-content'
import { CardsSkeleton } from '@/components/ui/page-skeleton'

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reportes</h1>
      <Suspense fallback={<CardsSkeleton />}>
        <ReportsContent />
      </Suspense>
    </div>
  )
}
