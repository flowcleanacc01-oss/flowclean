'use client'

// 465.3 (F) — ลูกค้าคุ้ม/ไม่คุ้ม (Customer Value)
//   รายได้ (วางบิล) เทียบต้นทุนให้บริการจาก GPS (ระยะ/น้ำมันของ leg ที่วิ่งไปถึงลูกค้า)
//   ⚠️ ต้อง "สังเคราะห์ GPS" (แท็บสถิติหน้างาน) ก่อน · ยังไม่รวมค่าแรง
import { useState, useEffect, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { fetchGpsLegs, fetchGpsVisits } from '@/lib/supabase-service'
import { buildCustomerValue } from '@/lib/customer-value'
import { formatCurrency, cn, roundTextColor } from '@/lib/utils'
import type { GpsLeg, GpsVisit } from '@/types'
import { Loader2, Search } from 'lucide-react'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'

export default function CustomerValueReport({ month }: { month: string }) {
  const { customers, billingStatements, rounds, getCustomer } = useStore()
  const [legs, setLegs] = useState<GpsLeg[] | null>(null)
  const [visits, setVisits] = useState<GpsVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [fuelPrice, setFuelPrice] = useState(32)
  const [kmPerLiter, setKmPerLiter] = useState(3.5)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetchGpsLegs(), fetchGpsVisits()])
      .then(([l, v]) => { if (!cancelled) { setLegs(l); setVisits(v); setLoading(false) } })
      .catch(() => { if (!cancelled) { setLegs([]); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const roundById = useMemo(() => new Map(rounds.map(r => [r.id, r])), [rounds])
  const rows = useMemo(
    () => (legs ? buildCustomerValue(customers, billingStatements, legs, visits, month, { fuelPrice, kmPerLiter }) : []),
    [legs, visits, customers, billingStatements, month, fuelPrice, kmPerLiter])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    return rows.filter(r => { const c = getCustomer(r.customerId); return matchesThaiQueryAnyField([c?.shortName, c?.name, c?.customerCode], search) })
  }, [rows, search, getCustomer])

  const lossCount = useMemo(() => rows.filter(r => r.serveKm > 0 && r.net < 0).length, [rows])
  const noGps = rows.length > 0 && rows.every(r => r.serveKm === 0)

  if (loading) return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> กำลังโหลดข้อมูล GPS…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-800">ลูกค้าคุ้ม/ไม่คุ้ม ({month})</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            รายได้ (วางบิล) − ต้นทุนน้ำมันที่วิ่งไป<span className="font-medium">ถึง</span>ลูกค้า (GPS) · เรียง “ไม่คุ้มก่อน” ·
            <span className="text-amber-600"> ยังไม่รวมค่าแรง</span>
            {lossCount > 0 && <span className="text-rose-600 font-medium"> · {lossCount} รายขาดทุน (เฉพาะค่าน้ำมัน)</span>}
          </p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาลูกค้า"
            className="border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-sm w-44" />
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap text-sm bg-slate-50 border border-slate-200 rounded-lg p-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">ราคาน้ำมัน (฿/ลิตร)</label>
          <input type="number" value={fuelPrice} min={0} step={0.5} onChange={e => setFuelPrice(Number(e.target.value) || 0)}
            className="w-24 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">กม./ลิตร (ประมาณ)</label>
          <input type="number" value={kmPerLiter} min={0.1} step={0.1} onChange={e => setKmPerLiter(Number(e.target.value) || 3.5)}
            className="w-24 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
      </div>

      {noGps && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          ⚠ ยังไม่มีข้อมูลเส้นทาง GPS → คำนวณต้นทุนให้บริการไม่ได้ · ไปกด “เริ่มสังเคราะห์” ที่ GPS → แท็บ “สถิติหน้างาน” ก่อน
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-10">ไม่มีข้อมูล</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="px-3 py-2.5 text-left font-medium">ลูกค้า</th>
                <th className="px-3 py-2.5 text-center font-medium">รอบ</th>
                <th className="px-3 py-2.5 text-right font-medium">รายได้</th>
                <th className="px-3 py-2.5 text-right font-medium" title="จำนวนครั้งที่จอด">ครั้ง</th>
                <th className="px-3 py-2.5 text-right font-medium" title="ระยะที่วิ่งไปถึงลูกค้า">ระยะ (กม.)</th>
                <th className="px-3 py-2.5 text-right font-medium">ค่าน้ำมัน</th>
                <th className="px-3 py-2.5 text-right font-medium">สุทธิ</th>
                <th className="px-3 py-2.5 text-right font-medium" title="รายได้ต่อกิโลเมตร — ยิ่งน้อยยิ่งไม่คุ้ม">รายได้/กม.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => {
                const c = getCustomer(r.customerId)
                const round = roundById.get(r.roundId)
                const loss = r.serveKm > 0 && r.net < 0
                return (
                  <tr key={r.customerId} className={cn('hover:bg-slate-50', loss && 'bg-rose-50/40')}>
                    <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{c?.shortName || c?.name || r.customerId}</td>
                    <td className="px-3 py-2 text-center">
                      {round
                        ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: round.color, color: roundTextColor(round.textColor) }}>{round.code}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(r.revenue)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{r.visits || '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{r.serveKm > 0 ? r.serveKm.toFixed(1) : '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">
                      {r.serveCost > 0 ? formatCurrency(r.serveCost) : '—'}{r.fuelEstimated && <span className="text-[10px] text-amber-500 ml-0.5" title="ประมาณจากระยะ">~</span>}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-bold', r.net >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(r.net)}</td>
                    <td className={cn('px-3 py-2 text-right', r.serveKm === 0 ? 'text-slate-300' : r.revenuePerKm < 30 ? 'text-rose-600 font-semibold' : 'text-slate-600')}>
                      {r.serveKm > 0 ? formatCurrency(r.revenuePerKm) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        “ระยะให้บริการ” = ระยะของเที่ยวที่วิ่งไปถึงลูกค้ารายนั้น (จาก GPS) · ลูกค้าที่ไม่มีข้อมูล GPS แสดงท้ายตาราง
      </p>
    </div>
  )
}
