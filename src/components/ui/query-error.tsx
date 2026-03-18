'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface QueryErrorProps {
  message?: string
  onRetry?: () => void
}

export function QueryError({
  message = 'Error al cargar los datos',
  onRetry,
}: QueryErrorProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Reintentar
        </Button>
      )}
    </div>
  )
}
