'use client'

// 366.1 — ใบเช็คผ้าเปล่า (blank checklist) cols ล้อ QT (source of truth)
// scan-friendly: ชื่อ+วันที่ printed เด่น (provenance แม่น) · รหัสกำกับทุกแถว (match ตรง)
// · บอกพนักงานเขียนตามสี (นับเข้า=แดง, แพค=น้ำเงิน) → ตรงกับ COLOR CONVENTION ที่สอน AI

import { formatDate } from '@/lib/utils'
import type { Customer, CompanyInfo, LinenItemDef } from '@/types'

interface BlankChecklistPrintProps {
  customer: Customer
  company: CompanyInfo
  items: LinenItemDef[]
  date: string
}

export default function BlankChecklistPrint({ customer, company, items, date }: BlankChecklistPrintProps) {
  return (
    <div className="bg-white p-8 max-w-[210mm] mx-auto text-sm print:p-0 print:shadow-none" id="print-blank-checklist">
      {/* Header */}
      <div className="flex justify-between items-start mb-4 border-b-2 border-[#1B3A5C] pb-3">
        <div>
          <h1 className="text-xl font-bold text-[#1B3A5C]">{company.name}</h1>
          <p className="text-xs text-slate-500">{company.nameEn}</p>
          <p className="text-xs text-slate-500 mt-1">{company.address}</p>
          <p className="text-xs text-slate-500">โทร: {company.phone}</p>
        </div>
        <h2 className="text-lg font-bold text-[#1B3A5C]">ใบเช็คผ้า</h2>
      </div>

      {/* Provenance: ชื่อลูกค้า + วันที่ printed ตัวใหญ่ → AI อ่าน provenance แม่น (ไม่ต้องเดาลายมือ) */}
      <div className="flex justify-between items-stretch mb-4 gap-3">
        <div className="flex gap-3 flex-1">
          <div className="border-2 border-[#1B3A5C] rounded-lg px-4 py-2 flex-1">
            <p className="text-[11px] text-slate-500">ชื่อลูกค้า</p>
            <p className="font-bold text-slate-900 text-2xl leading-tight">{customer.shortName || customer.name}</p>
            {customer.shortName && customer.name && customer.name !== customer.shortName && (
              <p className="text-[10px] text-slate-400">{customer.name}</p>
            )}
          </div>
          <div className="border-2 border-[#1B3A5C] rounded-lg px-4 py-2">
            <p className="text-[11px] text-slate-500">วันที่</p>
            <p className="font-bold text-slate-900 text-2xl leading-tight">{formatDate(date)}</p>
          </div>
        </div>
        <div className="border-2 border-[#1B3A5C] rounded-lg px-5 py-2 text-center">
          <p className="text-[11px] font-medium text-[#1B3A5C] mb-1">จำนวนถุงแพคส่ง</p>
          <div className="w-20 h-9 border-b-2 border-dotted border-slate-400 mx-auto"></div>
        </div>
      </div>

      {/* Items Table — border เข้ม + รหัสเด่น + ระบุสีที่ให้พนักงานเขียน */}
      <table className="w-full text-sm border-2 border-slate-600 mb-2">
        <thead>
          <tr className="bg-[#e8eef5]">
            <th className="text-center px-2 py-2 border border-slate-500 w-8">#</th>
            <th className="text-center px-2 py-2 border border-slate-500 w-14">รหัส</th>
            <th className="text-left px-2 py-2 border border-slate-500 w-32">รายการ</th>
            <th className="text-center px-2 py-2 border border-slate-500 w-24">นับส่ง <span className="text-red-600">(สีแดง)</span><br /><span className="text-[9px] font-normal text-slate-500">อ้างอิง</span></th>
            <th className="text-center px-2 py-2 border border-slate-500">จำนวนต่อถุง — แพคส่ง <span className="text-blue-600">(สีน้ำเงิน)</span><br /><span className="text-[9px] font-normal text-slate-500">หลายถุงคั่นด้วย + เช่น 43+36</span></th>
            <th className="text-center px-2 py-2 border border-slate-500 w-16">รวม</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.code}>
              <td className="text-center px-2 py-3 border border-slate-500 text-slate-400">{idx + 1}</td>
              <td className="text-center px-2 py-3 border border-slate-500 font-mono font-bold text-sm bg-slate-50">{item.code}</td>
              <td className="px-2 py-3 border border-slate-500">{item.name}</td>
              <td className="px-2 py-3 border border-slate-500"></td>
              <td className="px-2 py-3 border border-slate-500">
                {/* ช่องกว้างสำหรับเลขต่อถุง (เขียนสีน้ำเงิน 43+36) */}
                <div className="min-h-[30px]"></div>
              </td>
              <td className="px-2 py-3 border border-slate-500"></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mb-4">💡 เขียน <span className="text-red-600 font-medium">ยอดนับส่งด้วยปากกาแดง</span> · <span className="text-blue-600 font-medium">ยอดต่อถุง (แพคส่ง) ด้วยปากกาน้ำเงิน</span> — ช่วยให้สแกนแม่นขึ้น</p>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-16 mt-8 text-xs text-center">
        <div>
          <div className="border-b border-slate-400 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้ส่ง (Sender)</p>
        </div>
        <div>
          <div className="border-b border-slate-400 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้รับ (Receiver)</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
        <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
      </div>
    </div>
  )
}
