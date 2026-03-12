'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles, DollarSign, Zap, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAiCosts, useAiCostsSummary } from '@/hooks/use-ai-costs'

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${(usd * 100).toFixed(4)}¢`
  return `$${usd.toFixed(4)}`
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function AiCostsContent() {
  const { data: logs, isLoading } = useAiCosts()
  const { data: summary } = useAiCostsSummary()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Costos IA</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Uso de OpenAI por conversación — modelo, tokens y costo estimado
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Costo este mes</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCost(summary.monthCost) : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary ? formatTokens(summary.monthTokens) : '—'} tokens
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Costo total</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCost(summary.totalCost) : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary ? formatTokens(summary.totalTokens) : '—'} tokens totales
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Llamadas totales</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? summary.callCount.toLocaleString('es-AR') : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">mensajes procesados por IA</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Costo promedio</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCost(summary.avgCostPerCall) : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">por mensaje</p>
          </CardContent>
        </Card>
      </div>

      {/* Usage table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Bot</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="text-right">Tokens entrada</TableHead>
              <TableHead className="text-right">Tokens salida</TableHead>
              <TableHead className="text-right">Costo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!logs || logs.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay registros de uso de IA todavía.
                </TableCell>
              </TableRow>
            )}
            {logs?.map((log) => {
              const customer = log.conversations?.customers
              const customerName = customer
                ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() ||
                  customer.telegram_username ||
                  'Desconocido'
                : '—'

              return (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: es })}
                  </TableCell>
                  <TableCell>
                    {log.bots ? (
                      <Badge
                        variant="outline"
                        style={{ borderColor: log.bots.color, color: log.bots.color }}
                      >
                        {log.bots.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{customerName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {log.model}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatTokens(log.prompt_tokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatTokens(log.completion_tokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {formatCost(Number(log.cost_usd))}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
