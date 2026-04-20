'use client'

import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { compareDNByLastOfMonth } from '@/lib/transport-fee'
import type { DeliveryNote, Customer } from '@/types'
import type { RecalcResult } from '@/lib/sync-discrepancy'

interface Props {
  /** SD ที่ถูกแก้ (qty หรือ adj) */
  affectedDn: DeliveryNote
  customer: Customer
  /** DN ทั้งหมด (สำหรับ filter เดือนเดียวกัน) — อาจเป็น virtual (qty ใหม่) */
  allDeliveryNotes: DeliveryNote[]
  /** ผล recalc จาก recalcTransportAfterSync หรือ recalcTransportAfterAdj */
  recalcResults: RecalcResult[]
  recalcTrip: boolean
  setRecalcTrip: (v: boolean) => void
  recalcMonth: boolean
  setRecalcMonth: (v: boolean) => void
  /** true ถ้า SD มี extraCharge/discount ที่มีอยู่แล้ว → แสดง note อธิบาย */
  hasAdj?: boolean
}

/**
 * TransportFeeImpactPreview (112.1/115)
 *
 * Shared component แสดง "ผลกระทบต่อค่ารถ — เดือน YYYY-MM" pattern
 * ใช้ใน:
 * - SD Adjust Confirm Modal (Feature 111) [TODO migrate]
 * - SD Sync Modal (Feature 115)
 * - DiscrepancyHelperModal (Feature 112.1)
 *
 * Render null ถ้าไม่มีค่ารถอะไรเปลี่ยน
 */
export default function TransportFeeImpactPreview({
  affectedDn, customer, allDeliveryNotes, recalcResults,
  recalcTrip, setRecalcTrip, recalcMonth, setRecalcMonth, hasAdj,
}: Props) {
  const thisDn = recalcResults.find(r => r.dnId === affectedDn.id)
  const otherDnResult = recalcResults.find(r => r.dnId !== affectedDn.id)
  const otherDn = otherDnResult ? allDeliveryNotes.find(d => d.id === otherDnResult.dnId) : null

  const oldTripFee = affectedDn.transportFeeTrip || 0
  const newTripFee = thisDn?.newTripFee ?? oldTripFee
  const oldMonthFee = affectedDn.transportFeeMonth || 0
  const newMonthFee = thisDn?.newMonthFee
  const otherNewMonthFee = otherDnResult?.newMonthFee

  const tripFeeWillChange = newTripFee !== oldTripFee
  const monthFeeWillChange = newMonthFee !== undefined && newMonthFee !== oldMonthFee
  const otherMonthFeeWillChange = otherNewMonthFee !== undefined && otherNewMonthFee !== (otherDn?.transportFeeMonth || 0)
  const anyFeeWillChange = tripFeeWillChange || monthFeeWillChange || otherMonthFeeWillChange

  if (!anyFeeWillChange) return null

  const month = affectedDn.date.slice(0, 7)
  const monthDNs = allDeliveryNotes
    .filter(d => d.customerId === customer.id && d.date.startsWith(month))
    .sort(compareDNByLastOfMonth)
  const lastDnOfMonth = monthDNs[0]

  // DN ที่ถือ month fee (= ใบสุดท้าย — อาจเป็น affectedDn เอง หรือใบอื่น)
  const monthFeeDn = otherDn ?? (monthFeeWillChange ? affectedDn : null)
  const monthFeeDnNewFee = otherDn ? otherNewMonthFee : newMonthFee
  const monthFeeDnOldFee = otherDn ? (otherDn.transportFeeMonth || 0) : oldMonthFee

  return (
    <div className="border border-blue-200 rounded-lg overflow-hidden">
      <div className="bg-blue-100 px-3 py-2 text-xs font-medium text-blue-800">
        ผลกระทบต่อค่ารถ — เดือน {month}
      </div>

      {/* Month overview table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <th className="text-left px-3 py-1.5 font-medium">เลขที่</th>
              <th className="text-center px-2 py-1.5 font-medium">วันที่</th>
              <th className="text-right px-3 py-1.5 font-medium">ค่ารถ (ครั้ง)</th>
              <th className="text-right px-3 py-1.5 font-medium">ค่ารถ (เดือน)</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {monthDNs.map(d => {
              const isThis = d.id === affectedDn.id
              const isLast = d.id === lastDnOfMonth?.id
              const showNewTrip = isThis && recalcTrip && tripFeeWillChange
              const showNewMonth = isLast && recalcMonth && (monthFeeWillChange || otherMonthFeeWillChange)
              const rowOldTrip = isThis ? oldTripFee : (d.transportFeeTrip || 0)
              return (
                <tr key={d.id} className={cn(
                  'border-t border-slate-100',
                  isThis ? 'bg-amber-50' : 'hover:bg-slate-50',
                )}>
                  <td className={cn('px-3 py-1.5 font-mono', isThis && 'font-semibold text-amber-700')}>
                    {d.noteNumber}
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{formatDate(d.date)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {showNewTrip ? (
                      <span>
                        <span className="line-through text-red-400 mr-1">{formatCurrency(rowOldTrip)}</span>
                        <span className="text-emerald-600 font-medium">{formatCurrency(newTripFee)}</span>
                      </span>
                    ) : (
                      <span className="text-slate-600">{formatCurrency(rowOldTrip)}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {showNewMonth ? (
                      <span>
                        <span className="line-through text-red-400 mr-1">{formatCurrency(monthFeeDnOldFee)}</span>
                        <span className="text-emerald-600 font-medium">{formatCurrency(monthFeeDnNewFee || 0)}</span>
                      </span>
                    ) : (
                      <span className={cn(d.transportFeeMonth ? 'text-purple-700 font-medium' : 'text-slate-400')}>
                        {formatCurrency(d.transportFeeMonth || 0)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {isThis && isLast && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">กำลังแก้ · ใบสุดท้าย</span>}
                    {isThis && !isLast && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">กำลังแก้</span>}
                    {!isThis && isLast && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">ใบสุดท้าย</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Checkbox controls */}
      <div className="px-3 py-3 space-y-2.5 border-t border-blue-200 bg-blue-50">
        {tripFeeWillChange && (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={recalcTrip} onChange={e => setRecalcTrip(e.target.checked)}
              className="accent-[#1B3A5C] mt-0.5 shrink-0" />
            <span className="text-sm text-slate-700">
              ปรับค่ารถ (ครั้ง) ของ SD นี้:
              <span className="mx-1 text-red-500 line-through">{formatCurrency(oldTripFee)}</span>→
              <span className="ml-1 text-emerald-600 font-medium">{formatCurrency(newTripFee)}</span>
            </span>
          </label>
        )}
        {(monthFeeWillChange || otherMonthFeeWillChange) && monthFeeDn && (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={recalcMonth} onChange={e => setRecalcMonth(e.target.checked)}
              className="accent-[#1B3A5C] mt-0.5 shrink-0" />
            <span className="text-sm text-slate-700">
              ปรับค่ารถ (เดือน) ของ
              <span className="font-mono text-xs text-slate-500 mx-1">({monthFeeDn.noteNumber})</span>
              {monthFeeDn.id !== affectedDn.id && <span className="text-purple-600 text-xs mr-1">[ใบสุดท้าย]</span>}:
              <span className="mx-1 text-red-500 line-through">{formatCurrency(monthFeeDnOldFee)}</span>→
              <span className="ml-1 text-emerald-600 font-medium">{formatCurrency(monthFeeDnNewFee || 0)}</span>
            </span>
          </label>
        )}
        {hasAdj && (
          <p className="text-[11px] text-blue-600 pt-2 border-t border-blue-200 mt-1">
            * คำนวณรวม extra/discount ที่มีอยู่ใน SD แล้ว
          </p>
        )}
      </div>
    </div>
  )
}
