'use client'

// 453 — ใบแผนคิวรับ-ส่งผ้าเฉพาะลูกค้า (ส่งให้ลูกค้ารู้คิวล่วงหน้า)
//   portrait · พิมพ์/ส่ง PDF · จัดกลุ่มตามเดือน · pattern เดียวกับ RouteSheetPrint
import Image from 'next/image'
import type { ReactNode } from 'react'
import type { CompanyInfo } from '@/types'
import { thaiDateShort, thaiMonthYear, type PlanDay } from '@/lib/customer-plan'

interface CustomerPlanPrintProps {
  company: CompanyInfo
  customerName: string
  address: string
  phone: string
  rangeLabel: string
  days: PlanDay[]
}

export default function CustomerPlanPrint({ company, customerName, address, phone, rangeLabel, days }: CustomerPlanPrintProps) {
  return (
    <div className="bg-white p-8 mx-auto text-sm print:p-0 print:shadow-none" id="print-customer-plan">
      {/* Header */}
      <div className="flex justify-between items-start mb-4 border-b border-slate-300 pb-3 print:mb-3 print:pb-2">
        <div className="flex items-start gap-3">
          <Image src="/flowclean-logo.png" alt="FlowClean" width={48} height={48} className="mt-0.5 print:w-[48px] print:h-[48px]" />
          <div>
            <h1 className="text-xl font-bold text-[#1B3A5C]">{company.name}</h1>
            <p className="text-xs text-slate-500">{company.nameEn}</p>
            <p className="text-xs text-slate-500 mt-1">โทร: {company.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-[#1B3A5C]">แผนคิวรับ-ส่งผ้า</h2>
          <p className="text-xs text-slate-500">Pickup Schedule</p>
          <p className="text-sm font-semibold text-[#1B3A5C] mt-2">{rangeLabel}</p>
          <p className="text-xs text-slate-500">{days.length} ครั้ง</p>
        </div>
      </div>

      {/* Customer */}
      <div className="mb-4 print:mb-3">
        <p className="text-sm"><span className="text-slate-500">ลูกค้า: </span><span className="font-semibold text-[#1B3A5C]">{customerName}</span></p>
        {address && <p className="text-xs text-slate-500 mt-0.5">{address}</p>}
        {phone && <p className="text-xs text-slate-500">โทร: {phone}</p>}
      </div>

      {/* Schedule table (group by month) */}
      {days.length === 0 ? (
        <p className="text-center text-slate-400 py-8 border border-slate-300">ไม่มีคิวในช่วงเวลานี้</p>
      ) : (
        <table className="w-full text-sm border border-slate-300" style={{ breakInside: 'auto' }}>
          <thead>
            <tr className="bg-slate-100">
              <th className="text-center px-2 py-2 border border-slate-300 w-14">ครั้งที่</th>
              <th className="text-left px-3 py-2 border border-slate-300">วันที่</th>
              <th className="text-center px-3 py-2 border border-slate-300 w-44">ช่วงเวลา (โดยประมาณ)</th>
              <th className="text-center px-3 py-2 border border-slate-300 w-28">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const out: ReactNode[] = []
              let curMonth = ''
              days.forEach((d, idx) => {
                const mk = d.date.slice(0, 7)
                if (mk !== curMonth) {
                  curMonth = mk
                  out.push(
                    <tr key={`m-${mk}`} style={{ breakInside: 'avoid' }}>
                      <td colSpan={4} className="px-3 py-1.5 border border-slate-300 font-bold text-[13px] text-[#1B3A5C]"
                        style={{ borderTopWidth: 2, borderTopColor: '#334155' }}>
                        {thaiMonthYear(d.date)}
                      </td>
                    </tr>,
                  )
                }
                out.push(
                  <tr key={d.date} style={{ breakInside: 'avoid' }}>
                    <td className="text-center px-2 py-2.5 border border-slate-300 font-bold text-[#1B3A5C]">{idx + 1}</td>
                    <td className="px-3 py-2.5 border border-slate-300 font-medium">{thaiDateShort(d.date)}</td>
                    <td className="text-center px-3 py-2.5 border border-slate-300">{d.timeStart ? `${d.timeStart}${d.timeEnd ? ` - ${d.timeEnd}` : ''} น.` : '-'}</td>
                    <td className="text-center px-3 py-2.5 border border-slate-300 text-xs">
                      {d.note && <span className="font-medium text-[#1B3A5C]">{d.note}</span>}
                      {d.note && d.rescheduledIn && <span className="text-slate-300"> · </span>}
                      {d.rescheduledIn && <span className="text-amber-700">เพิ่มพิเศษ</span>}
                    </td>
                  </tr>,
                )
              })
              return out
            })()}
          </tbody>
        </table>
      )}

      <p className="text-[11px] text-slate-400 mt-3 print:mt-2">
        * เวลาที่ระบุเป็นช่วงโดยประมาณ อาจคลาดเคลื่อนตามสภาพการจราจร/หน้างาน · หากมีการเปลี่ยนแปลงทางเราจะแจ้งล่วงหน้า
      </p>
    </div>
  )
}
