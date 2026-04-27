'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import type { BillingStatement } from '@/types'

interface Props {
  billingStatements: BillingStatement[]
  months?: number  // default 12
  /** Extra revenue entries to merge in (e.g., legacy WB) — month=YYYY-MM */
  extraEntries?: { month: string; amount: number }[]
}

/**
 * Revenue Trend Chart (Feature B2)
 *
 * Bar chart รายได้รายเดือน 6-12 เดือนย้อนหลัง
 * - คำนวณจาก billingStatements.subtotal group by billingMonth
 * - Custom SVG (ไม่ต้องใช้ recharts เพื่อเก็บ bundle เล็ก)
 * - Hover ดูค่าเต็ม + %เปลี่ยนจากเดือนก่อน
 */
export default function RevenueTrendChart({ billingStatements, months = 12, extraEntries }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const data = useMemo(() => {
    // Generate last N month keys (YYYY-MM) including current
    const now = new Date()
    const keys: string[] = []
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    // Group by billingMonth
    const revByMonth = new Map<string, number>()
    for (const b of billingStatements) {
      const month = b.billingMonth
      if (keys.includes(month)) {
        revByMonth.set(month, (revByMonth.get(month) || 0) + b.subtotal)
      }
    }
    // Merge legacy/extra entries
    if (extraEntries) {
      for (const e of extraEntries) {
        if (keys.includes(e.month)) {
          revByMonth.set(e.month, (revByMonth.get(e.month) || 0) + e.amount)
        }
      }
    }

    return keys.map(key => ({
      key,
      label: (() => {
        const [y, m] = key.split('-')
        const d = new Date(Number(y), Number(m) - 1, 1)
        return d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
      })(),
      value: revByMonth.get(key) || 0,
    }))
  }, [billingStatements, months, extraEntries])

  const maxValue = Math.max(...data.map(d => d.value), 1)
  const total = data.reduce((s, d) => s + d.value, 0)
  const avg = total / data.length

  // Compare last vs previous
  const last = data[data.length - 1]?.value || 0
  const prev = data[data.length - 2]?.value || 0
  const deltaPct = prev > 0 ? ((last - prev) / prev) * 100 : 0

  const hoverData = hoverIdx !== null ? data[hoverIdx] : null
  const hoverDelta = hoverIdx !== null && hoverIdx > 0
    ? (() => {
        const p = data[hoverIdx - 1].value
        if (p === 0) return null
        return ((data[hoverIdx].value - p) / p) * 100
      })()
    : null

  // Chart dimensions
  const chartH = 180
  const barGap = 4

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">
            ยอดที่วางบิลแต่ละเดือน (ก่อน VAT)
            <span className="text-slate-400 font-normal"> — แนวโน้มรายได้ ({months} เดือน)</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">รวม {formatCurrency(total)} · เฉลี่ย/เดือน {formatCurrency(avg)}</p>
        </div>
        {prev > 0 && (
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            deltaPct > 0 ? 'bg-emerald-50 text-emerald-600' :
            deltaPct < 0 ? 'bg-red-50 text-red-600' :
            'bg-slate-50 text-slate-500'
          }`}>
            {deltaPct > 0 ? <TrendingUp className="w-3 h-3" /> :
             deltaPct < 0 ? <TrendingDown className="w-3 h-3" /> :
             <Minus className="w-3 h-3" />}
            {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}% MoM
          </div>
        )}
      </div>

      {/* Hover info bar */}
      <div className="min-h-[36px] mb-2">
        {hoverData ? (
          <div className="text-xs flex items-baseline gap-3">
            <span className="text-slate-500">{hoverData.label}</span>
            <span className="font-semibold text-slate-800 text-sm">{formatCurrency(hoverData.value)}</span>
            {hoverDelta !== null && (
              <span className={`font-mono ${
                hoverDelta > 0 ? 'text-emerald-600' :
                hoverDelta < 0 ? 'text-red-600' :
                'text-slate-400'
              }`}>
                {hoverDelta > 0 ? '+' : ''}{hoverDelta.toFixed(1)}%
              </span>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">แตะแท่งเพื่อดูรายละเอียด</p>
        )}
      </div>

      {/* Chart — SVG bars (stretch) + HTML labels (no stretch) — 129.5 font fix */}
      <svg
        viewBox={`0 0 ${data.length * 40} ${chartH}`}
        className="w-full h-[180px]"
        preserveAspectRatio="none"
      >
        {/* Horizontal gridlines (25/50/75%) */}
        {[0.25, 0.5, 0.75].map(p => (
          <line
            key={p}
            x1="0" x2={data.length * 40}
            y1={chartH - chartH * p} y2={chartH - chartH * p}
            stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2 2"
          />
        ))}

        {/* Avg line */}
        {avg > 0 && (
          <line
            x1="0" x2={data.length * 40}
            y1={chartH - (avg / maxValue) * chartH}
            y2={chartH - (avg / maxValue) * chartH}
            stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="4 3"
          />
        )}

        {/* Bars */}
        {data.map((d, i) => {
          const h = d.value === 0 ? 0 : Math.max(2, (d.value / maxValue) * chartH)
          const x = i * 40 + barGap
          const y = chartH - h
          const w = 40 - barGap * 2
          const isHover = hoverIdx === i
          const isLast = i === data.length - 1
          return (
            <g key={d.key}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onTouchStart={() => setHoverIdx(i)}
              className="cursor-pointer"
            >
              {/* Invisible hit area */}
              <rect x={i * 40} y="0" width="40" height={chartH} fill="transparent" />
              {/* Bar */}
              <rect
                x={x} y={y} width={w} height={h}
                rx="2"
                fill={isHover ? '#1B3A5C' : isLast ? '#3DD8D8' : '#93c5fd'}
                className="transition-colors"
              />
              {/* Zero-value dash */}
              {d.value === 0 && (
                <line x1={x} x2={x + w} y1={chartH - 1} y2={chartH - 1} stroke="#cbd5e1" strokeWidth="1" />
              )}
            </g>
          )
        })}
      </svg>

      {/* X-axis labels — HTML (ไม่ stretch, font สัดส่วนปกติ) — 129.5 */}
      <div className="flex mt-1.5 pb-1">
        {data.map((d, i) => {
          const isHover = hoverIdx === i
          const isLast = i === data.length - 1
          return (
            <div
              key={d.key}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onTouchStart={() => setHoverIdx(i)}
              className={cn(
                'flex-1 text-center text-[11px] cursor-pointer transition-colors select-none',
                isHover ? 'text-[#1B3A5C] font-semibold'
                  : isLast ? 'text-[#1B3A5C] font-medium'
                  : 'text-slate-500'
              )}
            >
              {d.label}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[#3DD8D8]" />เดือนปัจจุบัน
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-blue-300" />เดือนก่อนหน้า
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 border-t border-dashed border-slate-400" />ค่าเฉลี่ย
        </div>
      </div>
    </div>
  )
}
