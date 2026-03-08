'use client'

import { memo } from 'react'
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

export const ReportsChart = memo(function ReportsChart({ data, period }: ReportsChartProps) {
  return (
    <Card className="shadow-sm border overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{periodTitles[period]}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="label"
                className="text-xs"
                tick={{ fill: 'oklch(0.50 0.02 240)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'oklch(0.50 0.02 240)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={35}
              />
              <Tooltip
                cursor={{ fill: 'oklch(0.90 0.01 240 / 0.5)' }}
                contentStyle={{
                  backgroundColor: 'oklch(0.99 0.003 240)',
                  border: '1px solid oklch(0.90 0.015 240)',
                  borderRadius: '12px',
                  fontSize: '13px',
                  boxShadow: '0 4px 12px oklch(0 0 0 / 0.08)',
                  padding: '8px 12px',
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="conversaciones"
                name="Conversaciones"
                fill="oklch(0.72 0.12 230)"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="clientes"
                name="Clientes nuevos"
                fill="oklch(0.55 0.18 240)"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="pagados"
                name="Pagaron"
                fill="oklch(0.55 0.16 155)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
})
