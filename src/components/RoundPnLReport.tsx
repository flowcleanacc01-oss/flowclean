'use client'

// 465.3 (D) — กำไรตามรอบ (Profit by Round)
//   รายได้ (ยอดวางบิลของลูกค้าในรอบ) − ต้นทุนน้ำมัน (จาก GPS legs 449) = กำไรเบื้องต้น
//   ⚠️ ต้นทุนน้ำมันต้อง "สังเคราะห์ GPS" (แท็บสถิติหน้างาน) ก่อน · ยังไม่รวมค่าแรง/ค่าเสื่อม
import { useState, useEffect, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { fetchGpsLegs } from '@/lib/supabase-service'
import { buildRoundPnL, type RoundPnLRow } from '@/lib/round-pnl'
import { formatCurrency, cn, roundTextColor } from '@/lib/utils'
import type { GpsLeg } from '@/types'
import { Loader2, ChevronDown, ChevronRight, Fuel, Wallet, TrendingUp, Route } from 'lucide-react'

export default function RoundPnLReport({ month }: { month: string }) {
  const { customers, billingStatements, rounds, getCustomer } = useStore()
  const [legs, setLegs] = useState<GpsLeg[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [fuelPrice, setFuelPrice] = useState(32)
  const [kmPerLiter, setKmPerLiter] = useState(3.5)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchGpsLegs()
      .then(l => { if (!cancelled) { setLegs(l); setLoading(false) } })
      .catch(() => { if (!cancelled) { setLegs([]); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const roundById = useMemo(() => new Map(rounds.map(r => [r.id, r])), [rounds])
  const rows = useMemo(
    () => (legs ? buildRoundPnL(customers, billingStatements, legs, month, { fuelPrice, kmPerLiter }) : []),
    [legs, customers, billingStatements, month, fuelPrice, kmPerLiter])

  const totals = useMemo(() => rows.reduce(
    (t, r) => ({ revenue: t.revenue + r.revenue, fuelCost: t.fuelCost + r.fuelCost, profit: t.profit + r.profit, km: t.km + r.km }),
    { revenue: 0, fuelCost: 0, profit: 0, km: 0 }), [rows])
  const noGps = rows.length > 0 && totals.km === 0

  const custName = (id: string) => { const c = getCustomer(id); return c ? (c.shortName || c.name) : id }

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> กำลังโหลดข้อมูลเส้นทาง (GPS)…</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-[#3DD8D8]" /> กำไรตามรอบ ({month})</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          รายได้ = ยอดวางบิลของลูกค้าในรอบ · ต้นทุน = ค่าน้ำมันจาก GPS (449) · <span className="text-amber-600">กำไรเบื้องต้น ยังไม่รวมค่าแรง/ค่าเสื่อม/ค่าซ่อม</span>
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} label="รายได้รวม" value={formatCurrency(totals.revenue)} />
        <KpiCard icon={Fuel} label="ค่าน้ำมันรวม (ประมาณ)" value={formatCurrency(totals.fuelCost)} />
        <KpiCard icon={TrendingUp} label="กำไรเบื้องต้นรวม" value={formatCurrency(totals.profit)} accent={totals.profit >= 0 ? 'emerald' : 'rose'} />
        <KpiCard icon={Route} label="ระยะวิ่งรวม (กม.)" value={totals.km.toFixed(0)} />
      </div>

      {/* สมมุติฐานต้นทุน */}
      <div className="flex items-end gap-3 flex-wrap text-sm bg-slate-50 border border-slate-200 rounded-lg p-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">ราคาน้ำมัน (฿/ลิตร)</label>
          <input type="number" value={fuelPrice} min={0} step={0.5} onChange={e => setFuelPrice(Number(e.target.value) || 0)}
            className="w-24 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">กม./ลิตร (ประมาณเมื่อ GPS ไม่มีน้ำมัน)</label>
          <input type="number" value={kmPerLiter} min={0.1} step={0.1} onChange={e => setKmPerLiter(Number(e.target.value) || 3.5)}
            className="w-24 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <p className="text-[11px] text-slate-400 pb-2">ปรับสมมุติฐานเพื่อดูกำไรแบบ what-if</p>
      </div>

      {noGps && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          ⚠ ยังไม่มีข้อมูลเส้นทาง GPS เดือนนี้ → ต้นทุนน้ำมัน = 0 (กำไร = รายได้) · ไปกด “เริ่มสังเคราะห์” ที่ GPS → แท็บ “สถิติหน้างาน” ก่อน
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-10">ไม่มีข้อมูลรายได้/รอบ ในเดือนนี้</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="px-3 py-2.5 text-left font-medium">รอบ</th>
                <th className="px-3 py-2.5 text-right font-medium">ลูกค้า</th>
                <th className="px-3 py-2.5 text-right font-medium">รายได้</th>
                <th className="px-3 py-2.5 text-right font-medium">ระยะ (กม.)</th>
                <th className="px-3 py-2.5 text-right font-medium">ค่าน้ำมัน</th>
                <th className="px-3 py-2.5 text-right font-medium">กำไรเบื้องต้น</th>
                <th className="px-3 py-2.5 text-right font-medium" title="รายได้ต่อกิโลเมตร">รายได้/กม.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => {
                const round = roundById.get(r.roundId)
                const open = expanded === r.roundId
                return (
                  <RoundRows key={r.roundId || 'none'} row={r} round={round} open={open}
                    onToggle={() => setExpanded(open ? null : r.roundId)} custName={custName} />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RoundRows({ row, round, open, onToggle, custName }: {
  row: RoundPnLRow
  round: { code: string; name: string; color: string; textColor?: string | null } | undefined
  open: boolean
  onToggle: () => void
  custName: (id: string) => string
}) {
  return (
    <>
      <tr className="hover:bg-slate-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            <span className="px-1.5 py-0.5 rounded text-[11px] font-bold"
              style={{ backgroundColor: round?.color || '#94a3b8', color: roundTextColor(round?.textColor) }}>{round?.code || '—'}</span>
            <span className="font-medium text-slate-700">{round?.name || 'ไม่ระบุรอบ'}</span>
          </span>
        </td>
        <td className="px-3 py-2.5 text-right text-slate-500">{row.customerCount}</td>
        <td className="px-3 py-2.5 text-right font-medium text-slate-700">{formatCurrency(row.revenue)}</td>
        <td className="px-3 py-2.5 text-right text-slate-500">{row.km > 0 ? row.km.toFixed(0) : '—'}</td>
        <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">
          {row.fuelCost > 0 ? formatCurrency(row.fuelCost) : '—'}
          {row.fuelEstimated && <span className="text-[10px] text-amber-500 ml-1" title="ประมาณจากระยะทาง (V2X ไม่มีค่าน้ำมัน)">~</span>}
        </td>
        <td className={cn('px-3 py-2.5 text-right font-bold', row.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(row.profit)}</td>
        <td className="px-3 py-2.5 text-right text-slate-500">{row.revenuePerKm > 0 ? formatCurrency(row.revenuePerKm) : '—'}</td>
      </tr>
      {open && row.customerRevenue.map(cr => (
        <tr key={cr.customerId} className="bg-slate-50/50 text-xs">
          <td className="pl-10 pr-3 py-1.5 text-slate-600" colSpan={2}>{custName(cr.customerId)}</td>
          <td className="px-3 py-1.5 text-right text-slate-600">{formatCurrency(cr.revenue)}</td>
          <td colSpan={4} />
        </tr>
      ))}
    </>
  )
}

function KpiCard({ icon: Icon, label, value, accent }: {
  icon: React.ElementType; label: string; value: string; accent?: 'emerald' | 'rose'
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className={cn('text-lg font-bold', accent === 'emerald' ? 'text-emerald-600' : accent === 'rose' ? 'text-rose-600' : 'text-slate-800')}>{value}</div>
    </div>
  )
}
