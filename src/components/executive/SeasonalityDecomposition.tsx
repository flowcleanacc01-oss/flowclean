'use client'

/**
 * 222.2 — Seasonality Decomposition
 * Multi-year monthly revenue → trend + seasonal index + residual
 * Source: bills + legacy WB
 */
import { useMemo } from 'react'
import { ComposedChart, Line, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, ReferenceLine } from 'recharts'
import { formatCurrency, cn } from '@/lib/utils'
import { TrendingUp } from 'lucide-react'
import type { SeasonalityData } from '@/lib/use-executive-tier23'
import { Card, Empty } from './ItemMixProfitability'

const MONTH_NAMES = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

interface Props { data: SeasonalityData }

export default function SeasonalityDecomposition({ data }: Props) {
  const chartSeries = useMemo(() => data.series.map(p => ({
    ym: p.ym,
    actual: Math.round(p.actual),
    trend: Math.round(p.trend),
    seasonal: Math.round(p.seasonal),
    isLegacy: p.isLegacy,
  })), [data.series])

  if (data.totalMonths === 0) {
    return <Empty msg="ไม่มีข้อมูลรายเดือน" />
  }

  const peakMonth = data.monthIndex.reduce((max, m) => m.index > max.index ? m : max, data.monthIndex[0])
  const lowMonth = data.monthIndex.reduce((min, m) => (m.count > 0 && m.index < min.index) ? m : min, data.monthIndex.find(m => m.count > 0) || data.monthIndex[0])

  return (
    <Card title="222.2 Seasonality Decomposition" icon={<TrendingUp className="w-4 h-4 text-cyan-600" />}
      sub={`${data.totalMonths} เดือน · ${data.legacyMonths > 0 ? `${data.legacyMonths} เดือนจาก legacy` : 'ปัจจุบันเท่านั้น'}`}
      legacyNote={data.legacyMonths > 0 ? '✅ รวม legacy WB' : undefined}>
      {/* Time series + trend */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartSeries} margin={{ top: 10, right: 20, left: 50, bottom: 30 }}>
            <XAxis dataKey="ym" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000).toFixed(0) + 'K'} />
            <Tooltip content={<TimeTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="actual" fill="#3DD8D8" name="Actual" />
            <Line type="monotone" dataKey="trend" stroke="#1B3A5C" strokeWidth={2.5} dot={false} name="Trend (12-mo MA)" />
            <ReferenceLine y={0} stroke="#94A3B8" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Seasonal index per month */}
      <div className="mt-5">
        <div className="text-sm font-medium text-slate-700 mb-2">📅 Seasonal Index (vs ค่าเฉลี่ย)</div>
        <div className="grid grid-cols-6 lg:grid-cols-12 gap-1.5">
          {data.monthIndex.map(m => {
            const pct = (m.index - 1) * 100
            const isPeak = m.monthOfYear === peakMonth.monthOfYear && m.count > 0
            const isLow = m.monthOfYear === lowMonth.monthOfYear && m.count > 0
            const color = m.count === 0 ? 'bg-slate-100 text-slate-400'
              : isPeak ? 'bg-emerald-500 text-white'
              : isLow ? 'bg-red-500 text-white'
              : pct > 5 ? 'bg-emerald-100 text-emerald-700'
              : pct < -5 ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-50 text-slate-600 border border-slate-200'
            return (
              <div key={m.monthOfYear} className={cn('rounded p-2 text-center', color)}>
                <div className="text-[10px] font-medium">{MONTH_NAMES[m.monthOfYear - 1]}</div>
                <div className="text-sm font-bold mt-0.5">
                  {m.count === 0 ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`}
                </div>
                {m.count > 0 && <div className="text-[9px] opacity-70">{m.count}ปี</div>}
              </div>
            )
          })}
        </div>
      </div>

      {peakMonth.count > 0 && lowMonth.count > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
            <strong>📈 High season:</strong> {MONTH_NAMES[peakMonth.monthOfYear - 1]} —
            สูงกว่าเฉลี่ย <strong>{((peakMonth.index - 1) * 100).toFixed(0)}%</strong>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <strong>📉 Low season:</strong> {MONTH_NAMES[lowMonth.monthOfYear - 1]} —
            ต่ำกว่าเฉลี่ย <strong>{Math.abs((lowMonth.index - 1) * 100).toFixed(0)}%</strong>
          </div>
        </div>
      )}
    </Card>
  )
}

function TimeTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs">
      <div className="font-semibold text-slate-700">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</div>
      ))}
    </div>
  )
}
