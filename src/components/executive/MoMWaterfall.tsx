'use client'

/**
 * 220.3 — Month-over-Month Waterfall
 * แสดง "ใครทำให้ยอดขึ้น/ลง" — top growers + losers
 */
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell } from 'recharts'
import { formatCurrency, cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import type { WaterfallRow, ExecutiveStats } from '@/lib/use-executive-dashboard'

interface Props {
  waterfall: WaterfallRow[]
  topGrowers: WaterfallRow[]
  topLosers: WaterfallRow[]
  stats: ExecutiveStats
  prevMonth: string
  currentMonth: string
}

const TYPE_COLOR = {
  new:    '#10B981',
  grew:   '#3DD8D8',
  stable: '#94A3B8',
  shrank: '#F59E0B',
  lost:   '#EF4444',
}

export default function MoMWaterfall({ waterfall, topGrowers, topLosers, stats, prevMonth, currentMonth }: Props) {
  // Build waterfall chart data: prev → +/- per customer → current
  const chartData = useMemo(() => {
    const sorted = [...waterfall].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    const significant = sorted.filter(r => Math.abs(r.change) > 0.01).slice(0, 10)
    let cumulative = 0
    const prevTotal = stats.totalRevenue - stats.netChange
    const data: Array<{ name: string; start: number; end: number; change: number; type: string }> = [
      { name: prevMonth, start: 0, end: prevTotal, change: prevTotal, type: 'total' },
    ]
    cumulative = prevTotal
    for (const r of significant) {
      const start = cumulative
      const end = cumulative + r.change
      data.push({
        name: r.shortName,
        start: Math.min(start, end),
        end: Math.max(start, end),
        change: r.change,
        type: r.type,
      })
      cumulative = end
    }
    data.push({ name: currentMonth, start: 0, end: stats.totalRevenue, change: stats.totalRevenue, type: 'total' })
    return data
  }, [waterfall, stats, prevMonth, currentMonth])

  if (waterfall.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
        ไม่มีข้อมูลให้เปรียบเทียบ
      </div>
    )
  }

  const positive = stats.netChange >= 0

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            {positive ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
            220.3 Waterfall — เปรียบเทียบรายได้ {prevMonth} → {currentMonth}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            ดูว่าลูกค้ารายไหน "ทำให้ยอดขึ้น/ลง"
          </p>
        </div>
        <NetChangeBadge change={stats.netChange} pct={stats.netChangePct} />
      </div>

      {/* Waterfall chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 20, left: 60, bottom: 40 }}>
            <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 11 }} height={60} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000).toFixed(0) + 'K'} />
            <Tooltip content={<WaterfallTooltip />} />
            <ReferenceLine y={0} stroke="#94A3B8" />
            <Bar dataKey="end" stackId="stack" fill="#1B3A5C">
              {chartData.map((d, i) => {
                const fill = d.type === 'total'
                  ? '#1B3A5C'
                  : (TYPE_COLOR[d.type as keyof typeof TYPE_COLOR] || '#94A3B8')
                return <Cell key={i} fill={fill} />
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <StatBox label="รายได้เพิ่ม/ลด สุทธิ" value={`${stats.netChange >= 0 ? '+' : ''}${formatCurrency(stats.netChange)}`}
          sub={`${stats.netChangePct >= 0 ? '+' : ''}${stats.netChangePct.toFixed(1)}%`}
          color={positive ? 'emerald' : 'red'} />
        <StatBox label="ลูกค้าใหม่" value={String(stats.newCustomers)}
          sub={stats.newCustomers > 0 ? `เพิ่ม ${formatCurrency(topGrowers.filter(r => r.type === 'new').reduce((s, r) => s + r.change, 0))}` : '—'}
          color="emerald" />
        <StatBox label="ลูกค้าหาย" value={String(stats.lostCustomers)}
          sub={stats.lostCustomers > 0 ? `เสีย ${formatCurrency(Math.abs(topLosers.filter(r => r.type === 'lost').reduce((s, r) => s + r.change, 0)))}` : '—'}
          color="red" />
        <StatBox label="Top Grower vs Loser" value={
          topGrowers[0] && topLosers[0]
            ? `${topGrowers[0].shortName} / ${topLosers[0].shortName}`
            : '—'
        } sub="เปรียบเทียบ" color="slate" />
      </div>

      {/* Top movers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <MoverList title="🟢 Top Growers" items={topGrowers} type="grow" />
        <MoverList title="🔴 Top Losers" items={topLosers} type="lose" />
      </div>
    </div>
  )
}

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; change: number; type: string } }> }) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  if (d.type === 'total') {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs">
        <div className="font-semibold text-slate-700">{d.name}</div>
        <div className="text-slate-600 font-mono">รวม {formatCurrency(d.change)}</div>
      </div>
    )
  }
  const positive = d.change >= 0
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs">
      <div className="font-semibold text-slate-700">{d.name}</div>
      <div className={cn('font-mono', positive ? 'text-emerald-600' : 'text-red-600')}>
        {positive ? '+' : ''}{formatCurrency(d.change)}
      </div>
      <div className="text-slate-400 capitalize">{d.type}</div>
    </div>
  )
}

function NetChangeBadge({ change, pct }: { change: number; pct: number }) {
  const positive = change >= 0
  return (
    <div className={cn('px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5',
      positive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200')}>
      {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      <span>{positive ? '+' : ''}{formatCurrency(change)}</span>
      <span className="opacity-80">({positive ? '+' : ''}{pct.toFixed(1)}%)</span>
    </div>
  )
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red:     'bg-red-50 border-red-200 text-red-700',
    slate:   'bg-slate-50 border-slate-200 text-slate-700',
  }
  return (
    <div className={cn('p-2.5 border rounded-lg', colorMap[color])}>
      <div className="text-[11px] opacity-80 font-medium">{label}</div>
      <div className="text-base font-bold mt-0.5 truncate">{value}</div>
      <div className="text-[11px] opacity-70 truncate">{sub}</div>
    </div>
  )
}

function MoverList({ title, items, type }: { title: string; items: WaterfallRow[]; type: 'grow' | 'lose' }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className={cn('px-3 py-2 text-xs font-medium border-b',
        type === 'grow' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200')}>
        {title}
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-3 text-xs text-slate-400 text-center">—</div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {items.map(r => (
              <tr key={r.customerId} className="border-t border-slate-100 first:border-t-0">
                <td className="px-2 py-1.5 text-xs">
                  <span className="font-medium text-slate-700">{r.shortName}</span>
                  {r.type === 'new' && <span className="ml-1 text-[10px] px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded">NEW</span>}
                  {r.type === 'lost' && <span className="ml-1 text-[10px] px-1 py-0.5 bg-red-100 text-red-700 rounded">LOST</span>}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-xs">
                  <span className={r.change >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {r.change >= 0 ? '+' : ''}{formatCurrency(r.change)}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right text-xs text-slate-500">
                  {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
