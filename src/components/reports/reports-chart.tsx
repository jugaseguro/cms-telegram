'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface ChartDataPoint {
  label: string
  conversaciones: number
  transacciones: number
  clientes: number
  pagados: number
}

interface ReportsChartProps {
  data: ChartDataPoint[]
  period: 'day' | 'month' | 'year'
}

const periodTitles = {
  day: 'Actividad de hoy',
  month: 'Actividad del mes',
  year: 'Actividad del año',
}

export function ReportsChart({ data, period }: ReportsChartProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{periodTitles[period]}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '13px' }}
              />
              <Bar
                dataKey="conversaciones"
                name="Conversaciones"
                fill="oklch(0.72 0.12 230)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="clientes"
                name="Clientes nuevos"
                fill="oklch(0.55 0.18 240)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="pagados"
                name="Pagaron"
                fill="oklch(0.55 0.16 155)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
