'use client'

/**
 * 220.2 — Category Revenue Share (by customerType)
 */
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency, cn } from '@/lib/utils'
import { Building2 } from 'lucide-react'
import type { CategoryShareRow } from '@/lib/use-executive-dashboard'

const COLORS = ['#1B3A5C', '#3DD8D8', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#6366F1']

interface Props {
  rows: CategoryShareRow[]
  totalRevenue: number
}

export default function CategoryRevenueShare({ rows, totalRevenue }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
        ไม่มีข้อมูลหมวดลูกค้า
      </div>
    )
  }

  const pieData = rows.map(r => ({ name: r.label, value: r.revenue, share: r.share, customers: r.customerCount }))

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#1B3A5C]" />
          220.2 สัดส่วนรายได้ตามหมวดลูกค้า
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{rows.length} หมวด · รวม {formatCurrency(totalRevenue)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                label={(entry) => {
                  const e = entry as unknown as { share: number; name: string }
                  return e.share >= 5 ? `${e.name} ${e.share.toFixed(0)}%` : ''
                }}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CategoryTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Detail table */}
        <div className="overflow-y-auto max-h-64 border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left">หมวด</th>
                <th className="px-2 py-1.5 text-right">ลูกค้า</th>
                <th className="px-2 py-1.5 text-right">รายได้</th>
                <th className="px-2 py-1.5 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.category} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="font-medium text-slate-700">{r.label}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs text-slate-500">{r.customerCount}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{formatCurrency(r.revenue)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs font-medium text-[#1B3A5C]">{r.share.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CategoryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; share: number; customers: number } }> }) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs">
      <div className="font-semibold text-slate-700">{d.name}</div>
      <div className="text-slate-500">{d.customers} ลูกค้า</div>
      <div className="text-slate-600">{formatCurrency(d.value)}</div>
      <div className="text-[#1B3A5C] font-medium">{d.share.toFixed(1)}%</div>
    </div>
  )
}
