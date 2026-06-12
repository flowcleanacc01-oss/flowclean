'use client'

// P5.2 — ใบแผนการวิ่งรถ (Route Sheet) สำหรับคนขับ
// landscape · พิมพ์/ส่ง PDF ให้คนขับเอาไปวิ่งตามลำดับ

import Image from 'next/image'
import type { ReactNode } from 'react'
import type { CompanyInfo } from '@/types'

export interface RouteStop {
  customerName: string
  address: string
  phone: string
  statusLabel: string   // เช่น "SD-20260524-003" หรือ "รอสร้าง" / "รอบเสริม"
  roundLabel?: string   // 431 — หัวกลุ่มรอบ เช่น "รอบ V · 04:00–13:00" (แถวที่ label เปลี่ยน = ขึ้น section ใหม่ + นับ 1 ใหม่)
}

interface RouteSheetPrintProps {
  dateLabel: string      // วันที่แบบเต็ม (ไทย)
  company: CompanyInfo
  stops: RouteStop[]
}

export default function RouteSheetPrint({ dateLabel, company, stops }: RouteSheetPrintProps) {
  return (
    <div className="bg-white p-8 mx-auto text-sm print:p-0 print:shadow-none" id="print-route-sheet">
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
          <h2 className="text-lg font-bold text-[#1B3A5C]">ใบแผนการวิ่งรถ</h2>
          <p className="text-xs text-slate-500">Route Sheet</p>
          <p className="text-sm font-semibold text-[#1B3A5C] mt-2">วันที่: {dateLabel}</p>
          <p className="text-xs text-slate-500">{stops.length} จุด</p>
        </div>
      </div>

      {/* Driver / vehicle line (เว้นให้กรอกมือ) */}
      <div className="flex gap-8 mb-4 text-xs text-slate-600 print:mb-3">
        <span>คนขับ: ____________________</span>
        <span>ทะเบียนรถ: ____________________</span>
        <span>เลขไมล์เริ่ม/จบ: __________ / __________</span>
      </div>

      {/* Stops table */}
      <table className="w-full text-sm border border-slate-300" style={{ breakInside: 'auto' }}>
        <thead>
          <tr className="bg-slate-100">
            <th className="text-center px-2 py-2 border border-slate-300 w-10">ลำดับ</th>
            <th className="text-left px-3 py-2 border border-slate-300 w-44">ลูกค้า</th>
            <th className="text-left px-3 py-2 border border-slate-300">ที่อยู่</th>
            <th className="text-left px-3 py-2 border border-slate-300 w-28">โทร</th>
            <th className="text-left px-3 py-2 border border-slate-300 w-28">สถานะ</th>
            <th className="text-center px-3 py-2 border border-slate-300 w-32">เวลา / เซ็นรับ</th>
          </tr>
        </thead>
        <tbody>
          {stops.length === 0 ? (
            <tr><td colSpan={6} className="text-center px-3 py-6 border border-slate-300 text-slate-400">ไม่มีจุดวิ่งในวันนี้</td></tr>
          ) : (() => {
            // 431 — แบ่ง section ตามรอบ: label เปลี่ยน = แทรกแถวหัวรอบ + เริ่มนับลำดับใหม่
            //   เน้นด้วยเส้นหนา + ตัวหนา (ไม่ถมพื้นสี — กันถ่ายเอกสารซ้ำแล้วพื้นกลบตัวหนังสือ)
            const out: ReactNode[] = []
            let seq = 0
            stops.forEach((s, idx) => {
              if (s.roundLabel && s.roundLabel !== stops[idx - 1]?.roundLabel) {
                seq = 0
                out.push(
                  <tr key={`h-${idx}`} style={{ breakInside: 'avoid' }}>
                    <td colSpan={6} className="px-3 py-1.5 border border-slate-300 font-bold text-[13px] text-[#1B3A5C]"
                      style={{ borderTopWidth: 2, borderTopColor: '#334155' }}>
                      {s.roundLabel}
                    </td>
                  </tr>,
                )
              }
              seq++
              out.push(
                <tr key={idx} style={{ breakInside: 'avoid' }}>
                  <td className="text-center px-2 py-3 border border-slate-300 font-bold text-[#1B3A5C]">{seq}</td>
                  <td className="px-3 py-3 border border-slate-300 font-medium">{s.customerName}</td>
                  <td className="px-3 py-3 border border-slate-300 text-xs text-slate-600">{s.address || '-'}</td>
                  <td className="px-3 py-3 border border-slate-300 text-xs">{s.phone || '-'}</td>
                  <td className="px-3 py-3 border border-slate-300 text-xs">{s.statusLabel}</td>
                  <td className="px-3 py-3 border border-slate-300"></td>
                </tr>,
              )
            })
            return out
          })()}
        </tbody>
      </table>

      <p className="text-[11px] text-slate-400 mt-3 print:mt-2">
        * ลำดับการวิ่งจัดจากปฏิทินขนส่ง — คนขับปรับหน้างานได้ตามความเหมาะสม
      </p>
    </div>
  )
}
