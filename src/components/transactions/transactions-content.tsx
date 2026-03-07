'use client'

import { useState } from 'react'
import { TransactionTable } from '@/components/transactions/transaction-table'
import { RegisterTransactionDialog } from '@/components/transactions/register-transaction-dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export function TransactionsContent() {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transacciones</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Registrar carga
        </Button>
      </div>
      <TransactionTable />
      <RegisterTransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
