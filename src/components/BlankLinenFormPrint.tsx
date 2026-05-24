'use client'

// 366.1 — ใบส่งรับผ้าเปล่า (blank LF form) cols ล้อ QT (source of truth)
// scan-friendly: ชื่อ+วันที่ printed เด่น (provenance แม่น) · รหัสกำกับทุกแถว (match ตรง) · border เข้ม
// คอลัมน์ตรงกับที่ AI scan อ่าน (362): ลูกค้านับส่ง/เคลม/โรงซักนับเข้า/โรงซักแพคส่ง

import { formatDate } from '@/lib/utils'
import type { Customer, CompanyInfo, LinenItemDef } from '@/types'

interface Props {
  customer: Customer
  company: CompanyInfo
  items: LinenItemDef[]
  date: string
}

export default function BlankLinenFormPrint({ customer, company, items, date }: Props) {
  return (
    <div className="bg-white p-8 max-w-[210mm] mx-auto text-sm print:p-0 print:shadow-none" id="print-blank-lf">
      {/* Header */}
      <div className="flex justify-between items-start mb-4 border-b-2 border-[#1B3A5C] pb-3">
        <div>
          <h1 className="text-xl font-bold text-[#1B3A5C]">{company.name}</h1>
          <p className="text-xs text-slate-500">{company.nameEn}</p>
          <p className="text-xs text-slate-500 mt-1">{company.address}</p>
          <p className="text-xs text-slate-500">โทร: {company.phone}</p>
        </div>
        <h2 className="text-lg font-bold text-[#1B3A5C]">ใบส่ง-รับผ้า</h2>
      </div>

      {/* Provenance: ชื่อลูกค้า + วันที่ printed ตัวใหญ่ → AI อ่าน provenance แม่น */}
      <div className="flex justify-between items-stretch mb-3 gap-3">
        <div className="flex gap-3">
          <div className="border-2 border-[#1B3A5C] rounded-lg px-4 py-2">
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
        <div className="text-xs text-slate-400 self-end">{items.length} รายการ (ตาม QT)</div>
      </div>

      {/* Items Table — cols ล้อ QT + ตรงกับ AI scan · border เข้ม + รหัสเด่น */}
      <table className="w-full border-2 border-slate-600 mb-4" style={{ fontSize: '11px' }}>
        <thead>
          <tr className="bg-[#e8eef5] text-[#1B3A5C]">
            <th className="text-center px-1 py-1.5 border border-slate-500 w-7">#</th>
            <th className="text-center px-1 py-1.5 border border-slate-500 w-12">รหัส</th>
            <th className="text-left px-1 py-1.5 border border-slate-500">รายการ</th>
            <th className="text-center px-1 py-1.5 border border-slate-500 w-14">ลูกค้า<br />นับส่ง</th>
            <th className="text-center px-1 py-1.5 border border-slate-500 w-12">เคลม</th>
            <th className="text-center px-1 py-1.5 border border-slate-500 w-14">โรงซัก<br />นับเข้า</th>
            <th className="text-center px-1 py-1.5 border border-slate-500 w-14">โรงซัก<br />แพคส่ง</th>
            <th className="text-center px-1 py-1.5 border border-slate-500 w-14">ลูกค้า<br />นับกลับ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.code}>
              <td className="text-center px-1 py-2 border border-slate-500 text-slate-400">{idx + 1}</td>
              <td className="text-center px-1 py-2 border border-slate-500 font-mono font-bold bg-slate-50">{item.code}</td>
              <td className="px-1 py-2 border border-slate-500">{item.name}</td>
              <td className="border border-slate-500"></td>
              <td className="border border-slate-500"></td>
              <td className="border border-slate-500"></td>
              <td className="border border-slate-500"></td>
              <td className="border border-slate-500"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Bag count */}
      <div className="flex justify-end mb-4">
        <div className="border border-slate-400 rounded px-4 py-2 text-center text-xs">
          <span className="text-slate-500">จำนวนถุงแพคส่ง: </span>
          <span className="inline-block w-16 border-b border-dotted border-slate-400">&nbsp;</span>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-16 mt-6 text-xs text-center">
        <div>
          <div className="border-b border-slate-400 pb-7 mb-2"></div>
          <p className="text-slate-500">ผู้ส่ง (Sender)</p>
        </div>
        <div>
          <div className="border-b border-slate-400 pb-7 mb-2"></div>
          <p className="text-slate-500">ผู้รับ (Receiver)</p>
        </div>
      </div>

      <div className="mt-6 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
        <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
      </div>
    </div>
  )
}
