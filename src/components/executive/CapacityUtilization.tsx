'use client'

/**
 * 222.5 — Capacity Utilization
 * Daily pieces processed (LF.col5_factoryClaimApproved) — visualize daily load + heatmap
 * Source: current LF only (legacy ไม่มี LF data)
 */
import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts'
import { formatNumber, cn, formatDate } from '@/lib/utils'
import { Activity } from 'lucide-react'
import type { CapacityData } from '@/lib/use-executive-tier23'
import { Card, Empty } from './ItemMixProfitability'

const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

interface Props { data: CapacityData }

export default function CapacityUtilization({ data }: Props) {
  const series = useMemo(() => data.daily.map(d => ({
    date: d.date.slice(5), // MM-DD for axis
    full: d.date,
    pieces: d.countIn,
    util: d.utilization,
  })), [data])

  // Heatmap matrix: dayOfWeek (rows) × week (cols)
  const matrix = useMemo(() => {
    const weekSet = new Set(data.heatmap.map(c => c.weekOfYear))
    const weeks = Array.from(weekSet).sort()
    const map = new Map<string, number>()
    for (const c of data.heatmap) {
      const k = `${c.weekOfYear}-${c.dayOfWeek}`
      map.set(k, (map.get(k) || 0) + c.pieces)
    }
    return { weeks, map }
  }, [data])

  // Day-of-week aggregates
  const byDow = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0, 0]
    const counts = [0, 0, 0, 0, 0, 0, 0]
    for (const d of data.daily) {
      const dow = new Date(d.date).getDay()
      totals[dow] += d.countIn
      counts[dow] += 1
    }
    return totals.map((t, i) => ({ dow: i, total: t, avg: counts[i] === 0 ? 0 : t / counts[i] }))
  }, [data])

  if (data.totalDays === 0) {
    return <Empty msg="ไม่มี LF ในช่วงนี้" note="❌ Legacy ไม่มี LF data — ใช้ข้อมูลปัจจุบันเท่านั้น" />
  }

  return (
    <Card title="222.5 Capacity Utilization" icon={<Activity className="w-4 h-4 text-indigo-600" />}
      sub={`${data.workingDays} วันทำงาน · max ${formatNumber(data.maxDaily)} ชิ้น/วัน · avg ${formatNumber(Math.round(data.avgDaily))}`}
      legacyNote="❌ ไม่รวม legacy (ไม่มี LF)">
      {/* Daily timeline */}
      <div className="h-64 mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 10, right: 20, left: 50, bottom: 30 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip content={<DayTooltip />} />
            <ReferenceLine y={data.maxDaily} stroke="#EF4444" strokeDasharray="3 3" label={{ value: 'Peak', fill: '#EF4444', fontSize: 10 }} />
            <ReferenceLine y={data.avgDaily} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: 'Avg', fill: '#F59E0B', fontSize: 10 }} />
            <Line type="monotone" dataKey="pieces" stroke="#1B3A5C" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Day-of-week breakdown */}
      <div className="mb-4">
        <div className="text-sm font-medium text-slate-700 mb-2">📅 Average by day of week</div>
        <div className="grid grid-cols-7 gap-1.5">
          {byDow.map(d => {
            const peak = Math.max(...byDow.map(x => x.avg))
            const pct = peak === 0 ? 0 : (d.avg / peak) * 100
            const color = d.avg === 0 ? 'bg-slate-100 text-slate-400'
              : pct >= 80 ? 'bg-indigo-500 text-white'
              : pct >= 50 ? 'bg-indigo-200 text-indigo-800'
              : 'bg-indigo-50 text-indigo-600'
            return (
              <div key={d.dow} className={cn('rounded p-2 text-center', color)}>
                <div className="text-xs font-medium">{DAY_NAMES[d.dow]}</div>
                <div className="text-sm font-bold mt-0.5">{formatNumber(Math.round(d.avg))}</div>
                <div className="text-[10px] opacity-70">เฉลี่ย</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Heatmap (week × dow) */}
      {matrix.weeks.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">🔥 Heatmap (สัปดาห์ × วัน)</div>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="px-1.5 py-1 text-left text-slate-500"></th>
                  {matrix.weeks.map(w => (
                    <th key={w} className="px-1 py-0.5 text-[9px] text-slate-400 font-mono">{w.split('-')[1]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 0].map(dow => (
                  <tr key={dow}>
                    <td className="px-1.5 py-0.5 font-medium text-slate-600">{DAY_NAMES[dow]}</td>
                    {matrix.weeks.map(w => {
                      const v = matrix.map.get(`${w}-${dow}`) || 0
                      const pct = data.maxDaily === 0 ? 0 : (v / data.maxDaily) * 100
                      const bg = v === 0 ? 'bg-slate-50'
                        : pct >= 80 ? 'bg-indigo-500'
                        : pct >= 50 ? 'bg-indigo-300'
                        : pct >= 25 ? 'bg-indigo-200'
                        : 'bg-indigo-100'
                      return (
                        <td key={w} className={cn('w-5 h-5', bg)} title={`${w} ${DAY_NAMES[dow]}: ${formatNumber(v)}`}></td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-2">
            <span>0</span>
            <div className="flex">
              {['bg-slate-50', 'bg-indigo-100', 'bg-indigo-200', 'bg-indigo-300', 'bg-indigo-500'].map(c => (
                <div key={c} className={cn('w-3 h-3', c)}></div>
              ))}
            </div>
            <span>peak</span>
          </div>
        </div>
      )}
    </Card>
  )
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { date: string; full: string; pieces: number; util: number } }> }) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs">
      <div className="font-semibold text-slate-700">{formatDate(d.full)}</div>
      <div className="text-slate-600">{formatNumber(d.pieces)} ชิ้น</div>
      <div className="text-indigo-600 font-medium">{d.util.toFixed(1)}% utilization</div>
    </div>
  )
}
