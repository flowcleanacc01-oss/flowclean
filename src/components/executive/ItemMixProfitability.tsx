'use client'

/**
 * 222.1 — Item Mix Profitability
 * % revenue per item code + qty share + yield/piece
 * Source: current DN only (legacy ไม่มี item-level)
 */
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { formatCurrency, cn, formatNumber } from '@/lib/utils'
import { Package } from 'lucide-react'
import type { ItemMixRow } from '@/lib/use-executive-tier23'

const COLORS = ['#1B3A5C', '#3DD8D8', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1']

interface Props { rows: ItemMixRow[] }

export default function ItemMixProfitability({ rows }: Props) {
  const top10 = useMemo(() => rows.slice(0, 10), [rows])
  const totals = useMemo(() => ({
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    qty: rows.reduce((s, r) => s + r.qty, 0),
    items: rows.length,
  }), [rows])

  if (rows.length === 0) {
    return <Empty msg="ไม่มีข้อมูล item-level (ต้องมี DN ในช่วงนี้)" note="❌ Legacy data ไม่มี item-level — แสดงเฉพาะข้อมูลปัจจุบัน" />
  }

  return (
    <Card title="222.1 Item Mix Profitability" icon={<Package className="w-4 h-4 text-violet-600" />}
      sub={`${totals.items} รายการผ้า · ${formatNumber(totals.qty)} ชิ้น · ${formatCurrency(totals.revenue)}`}
      legacyNote="❌ ไม่รวม legacy (legacy ไม่มี item-level data)">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart top 10 by revenue */}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top10} margin={{ top: 10, right: 10, left: 50, bottom: 50 }}>
              <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} height={70} interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000).toFixed(0) + 'K'} />
              <Tooltip content={<MixTooltip />} />
              <Bar dataKey="revenue">
                {top10.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detail table */}
        <div className="overflow-y-auto max-h-72 border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left">รายการ</th>
                <th className="px-2 py-1.5 text-right">ชิ้น</th>
                <th className="px-2 py-1.5 text-right">รายได้</th>
                <th className="px-2 py-1.5 text-right">% Rev</th>
                <th className="px-2 py-1.5 text-right">ratio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const ratio = r.qtyShare === 0 ? 0 : r.revenueShare / r.qtyShare
                return (
                  <tr key={r.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: i < 10 ? COLORS[i] : '#cbd5e1' }} />
                        <span className="font-medium text-slate-700">{r.name}</span>
                      </span>
                      <div className="text-[10px] text-slate-400 ml-3.5">{r.code} · {r.customerCount} ลูกค้า</div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-slate-600">{formatNumber(r.qty)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{formatCurrency(r.revenue)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs font-medium text-[#1B3A5C]">{r.revenueShare.toFixed(1)}%</td>
                    <td className="px-2 py-1.5 text-right text-xs">
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px]',
                        ratio >= 1.1 ? 'bg-emerald-100 text-emerald-700' :
                        ratio >= 0.9 ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700')}>
                        {ratio.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 p-3 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-800">
        <strong>📖 ratio</strong> = % รายได้ ÷ % จำนวน ·
        <span className="text-emerald-700 font-medium"> ≥1.1 = ทำกำไรดี</span> (รายได้สูงกว่าสัดส่วนของจำนวน) ·
        <span className="text-amber-700 font-medium"> &lt;0.9 = ใช้เวลาเยอะ ราคาถูก</span> (volume เยอะ แต่รายได้น้อย)
      </div>
    </Card>
  )
}

function MixTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ItemMixRow }> }) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs">
      <div className="font-semibold text-slate-700">{d.name}</div>
      <div className="text-slate-500">{d.code} · {formatNumber(d.qty)} ชิ้น</div>
      <div className="text-slate-700 font-mono">{formatCurrency(d.revenue)} ({d.revenueShare.toFixed(1)}%)</div>
      <div className="text-[#1B3A5C] font-medium">{formatCurrency(d.yieldPerPiece)}/ชิ้น</div>
    </div>
  )
}

// shared shells
export function Card({ children, title, icon, sub, legacyNote }: {
  children: React.ReactNode; title: string; icon?: React.ReactNode; sub?: string; legacyNote?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">{icon}{title}</h3>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
        {legacyNote && (
          <span className="text-[10px] px-2 py-1 bg-slate-100 text-slate-600 rounded-full whitespace-nowrap">
            {legacyNote}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

export function Empty({ msg, note }: { msg: string; note?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
      <div className="text-slate-400 text-sm">{msg}</div>
      {note && <div className="text-xs text-slate-400 mt-2">{note}</div>}
    </div>
  )
}
