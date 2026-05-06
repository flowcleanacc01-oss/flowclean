'use client'

/**
 * 220.E — Yield per Piece (Revenue / Pieces)
 * บอกว่าลูกค้าจ่ายต่อชิ้นเฉลี่ยเท่าไหร่ — เห็นว่าลูกค้าใหญ่ vs premium
 */
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { formatCurrency, cn, formatNumber } from '@/lib/utils'
import { Award } from 'lucide-react'
import type { YieldRow } from '@/lib/use-executive-dashboard'

interface Props {
  rows: YieldRow[]
}

export default function YieldPerPiece({ rows }: Props) {
  const stats = useMemo(() => {
    if (rows.length === 0) return { avg: 0, max: 0, min: 0 }
    const totalRev = rows.reduce((s, r) => s + r.revenue, 0)
    const totalPieces = rows.reduce((s, r) => s + r.pieces, 0)
    return {
      avg: totalPieces === 0 ? 0 : totalRev / totalPieces,
      max: Math.max(...rows.map(r => r.yieldPerPiece)),
      min: Math.min(...rows.map(r => r.yieldPerPiece)),
    }
  }, [rows])

  const chartData = useMemo(() => {
    return [...rows].sort((a, b) => b.yieldPerPiece - a.yieldPerPiece).slice(0, 15).map(r => ({
      name: r.shortName,
      yieldPerPiece: r.yieldPerPiece,
      revenue: r.revenue,
      pieces: r.pieces,
    }))
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
        ไม่มีข้อมูล Yield (ต้องมี DN ในเดือนนี้)
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Award className="w-4 h-4 text-violet-600" />
          220.E Yield per Piece — รายได้ต่อชิ้น
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          เห็นว่าลูกค้ารายไหน "premium" (จ่ายแพงต่อชิ้น) vs "bulk" (จำนวนเยอะ ราคาถูก)
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card label="เฉลี่ย ฿/ชิ้น" value={formatCurrency(stats.avg)} color="indigo" />
        <Card label="สูงสุด" value={formatCurrency(stats.max)} color="emerald" />
        <Card label="ต่ำสุด" value={formatCurrency(stats.min)} color="red" />
      </div>

      <div className="h-72 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 50, bottom: 40 }}>
            <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} height={60} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `฿${v.toFixed(0)}`} />
            <Tooltip content={<YieldTooltip />} />
            <Bar dataKey="yieldPerPiece">
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.yieldPerPiece >= stats.avg ? '#10B981' : '#F59E0B'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Full table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">Rank</th>
              <th className="px-3 py-2 text-left">ลูกค้า</th>
              <th className="px-3 py-2 text-right">ชิ้น</th>
              <th className="px-3 py-2 text-right">รายได้</th>
              <th className="px-3 py-2 text-right">฿/ชิ้น</th>
              <th className="px-3 py-2 text-right">vs avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const vsAvg = stats.avg === 0 ? 0 : ((r.yieldPerPiece - stats.avg) / stats.avg) * 100
              return (
                <tr key={r.customerId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 text-slate-400 text-xs font-mono">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-700">{r.shortName}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-600">{formatNumber(r.pieces)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-600">{formatCurrency(r.revenue)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs font-bold text-[#1B3A5C]">{formatCurrency(r.yieldPerPiece)}</td>
                  <td className="px-3 py-1.5 text-right text-xs">
                    <span className={cn(vsAvg >= 0 ? 'text-emerald-600' : 'text-amber-600')}>
                      {vsAvg >= 0 ? '+' : ''}{vsAvg.toFixed(0)}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function YieldTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; yieldPerPiece: number; revenue: number; pieces: number } }> }) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs">
      <div className="font-semibold text-slate-700">{d.name}</div>
      <div className="text-slate-500">{formatNumber(d.pieces)} ชิ้น · {formatCurrency(d.revenue)}</div>
      <div className="text-[#1B3A5C] font-bold">{formatCurrency(d.yieldPerPiece)}/ชิ้น</div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red:     'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={cn('p-3 border rounded-lg', colorMap[color])}>
      <div className="text-xs opacity-80 font-medium">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  )
}
