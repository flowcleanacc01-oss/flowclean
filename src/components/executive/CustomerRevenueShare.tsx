'use client'

/**
 * 220.1 — Customer Revenue Share (Pie + Pareto + HHI)
 */
import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency, cn } from '@/lib/utils'
import { ShieldAlert, TrendingUp, Users } from 'lucide-react'
import type { CustomerShareRow, ExecutiveStats } from '@/lib/use-executive-dashboard'

const COLORS = [
  '#1B3A5C', '#3DD8D8', '#F59E0B', '#EF4444', '#10B981',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
]

const TOP_N = 8

interface Props {
  rows: CustomerShareRow[]
  stats: ExecutiveStats
}

export default function CustomerRevenueShare({ rows, stats }: Props) {
  const pieData = useMemo(() => {
    if (rows.length === 0) return []
    const top = rows.slice(0, TOP_N)
    const rest = rows.slice(TOP_N)
    const restRevenue = rest.reduce((sum, r) => sum + r.revenue, 0)
    const restShare = rest.reduce((sum, r) => sum + r.share, 0)
    const data = top.map(r => ({
      name: r.shortName,
      value: r.revenue,
      share: r.share,
    }))
    if (rest.length > 0) {
      data.push({
        name: `อื่นๆ (${rest.length} ราย)`,
        value: restRevenue,
        share: restShare,
      })
    }
    return data
  }, [rows])

  // Pareto cutoff (80%)
  const pareto80Index = rows.findIndex(r => r.cumShare >= 80)

  if (rows.length === 0) {
    return <EmptyState message="ไม่มีข้อมูลรายได้ในเดือนนี้" />
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#1B3A5C]" />
            220.1 สัดส่วนรายได้ตามลูกค้า
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {rows.length} ลูกค้า · รวม {formatCurrency(stats.totalRevenue)}
          </p>
        </div>
        <HHIBadge hhi={stats.hhi} level={stats.hhiLevel} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie chart */}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                paddingAngle={2}
                dataKey="value"
                label={(entry) => {
                  const e = entry as unknown as { share: number }
                  return e.share >= 5 ? `${e.share.toFixed(0)}%` : ''
                }}
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Pareto table */}
        <div className="overflow-y-auto max-h-72 border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left">#</th>
                <th className="px-2 py-1.5 text-left">ลูกค้า</th>
                <th className="px-2 py-1.5 text-right">รายได้</th>
                <th className="px-2 py-1.5 text-right">%</th>
                <th className="px-2 py-1.5 text-right">สะสม</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.customerId}
                  className={cn(
                    'border-t border-slate-100 hover:bg-slate-50',
                    pareto80Index >= 0 && i === pareto80Index && 'border-t-2 border-t-amber-500',
                  )}>
                  <td className="px-2 py-1.5 text-slate-400 text-xs font-mono">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: i < TOP_N ? COLORS[i] : '#cbd5e1' }} />
                      <span className="font-medium text-slate-700">{r.shortName}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{formatCurrency(r.revenue)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs font-medium text-[#1B3A5C]">{r.share.toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-slate-500">{r.cumShare.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Insight
          icon={<TrendingUp className="w-4 h-4" />}
          label="Pareto Top 20%"
          value={`${stats.paretoTopShare.toFixed(1)}%`}
          sub={`ของรายได้ทั้งหมด`}
          color="indigo"
        />
        <Insight
          icon={<ShieldAlert className="w-4 h-4" />}
          label="Concentration"
          value={(stats.hhi * 10000).toFixed(0)}
          sub={`HHI · ${hhiLabel(stats.hhiLevel)}`}
          color={stats.hhiLevel === 'high' ? 'red' : stats.hhiLevel === 'moderate' ? 'amber' : 'emerald'}
        />
        <Insight
          icon={<Users className="w-4 h-4" />}
          label="ลูกค้า"
          value={String(stats.totalCustomers)}
          sub="ที่มีรายได้ในเดือนนี้"
          color="slate"
        />
      </div>

      {pareto80Index >= 0 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <strong>Pareto Insight:</strong> {pareto80Index + 1} ลูกค้าแรก ({((pareto80Index + 1) / rows.length * 100).toFixed(0)}% ของฐาน)
          สร้างรายได้ <strong>80%</strong> ของทั้งหมด
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; share: number } }> }) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs">
      <div className="font-semibold text-slate-700">{d.name}</div>
      <div className="text-slate-600">{formatCurrency(d.value)}</div>
      <div className="text-[#1B3A5C] font-medium">{d.share.toFixed(1)}%</div>
    </div>
  )
}

function HHIBadge({ hhi, level }: { hhi: number; level: 'low' | 'moderate' | 'high' }) {
  const colorMap = {
    low:      'bg-emerald-100 text-emerald-700 border-emerald-200',
    moderate: 'bg-amber-100 text-amber-700 border-amber-200',
    high:     'bg-red-100 text-red-700 border-red-200',
  }
  return (
    <div className={cn('px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5', colorMap[level])}>
      <ShieldAlert className="w-3.5 h-3.5" />
      <span>HHI: {(hhi * 10000).toFixed(0)}</span>
      <span className="opacity-80">· {hhiLabel(level)}</span>
    </div>
  )
}

function hhiLabel(level: 'low' | 'moderate' | 'high'): string {
  return level === 'low' ? 'ต่ำ — ปลอดภัย' : level === 'moderate' ? 'ปานกลาง' : 'สูง — เสี่ยง'
}

function Insight({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string
}) {
  const colorMap: Record<string, string> = {
    indigo:  'text-indigo-700 bg-indigo-50 border-indigo-200',
    amber:   'text-amber-700 bg-amber-50 border-amber-200',
    red:     'text-red-700 bg-red-50 border-red-200',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    slate:   'text-slate-700 bg-slate-50 border-slate-200',
  }
  return (
    <div className={cn('p-3 rounded-lg border', colorMap[color])}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">{icon}{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      <div className="text-xs opacity-70">{sub}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
      {message}
    </div>
  )
}
