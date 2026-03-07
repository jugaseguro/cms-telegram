import { Suspense } from 'react'
import { CustomerTable } from '@/components/customers/customer-table'
import { TableSkeleton } from '@/components/ui/page-skeleton'

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Clientes</h1>
      <Suspense fallback={<TableSkeleton columns={7} />}>
        <CustomerTable />
      </Suspense>
    </div>
  )
}
