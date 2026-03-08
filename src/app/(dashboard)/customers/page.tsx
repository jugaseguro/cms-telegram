import { CustomerTable } from '@/components/customers/customer-table'

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Clientes</h1>
      <CustomerTable />
    </div>
  )
}
