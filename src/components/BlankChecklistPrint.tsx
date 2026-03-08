'use client'

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
        <div className="text-right">
          <h2 className="text-lg font-bold text-[#1B3A5C]">ใบเช็คของ</h2>
          <p className="text-xs text-slate-500">วันที่: {formatDate(date)}</p>
        </div>
      </div>

      {/* Customer + Bag Count Box */}
      <div className="flex justify-between items-start mb-4">
        <div className="text-xs">
          <p className="text-slate-500">ลูกค้า:</p>
          <p className="font-medium text-slate-800 text-base">{customer.name}</p>
        </div>
        <div className="border-2 border-[#1B3A5C] rounded-lg px-6 py-3 text-center">
          <p className="text-xs font-medium text-[#1B3A5C] mb-1">จำนวนถุงแพคส่ง</p>
          <div className="w-24 h-10 border-b-2 border-dotted border-slate-400"></div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm border border-slate-400 mb-4">
        <thead>
          <tr className="bg-[#e8eef5]">
            <th className="text-center px-2 py-2 border border-slate-400 w-10">ลำดับ</th>
            <th className="text-left px-2 py-2 border border-slate-400 w-14">รหัส</th>
            <th className="text-left px-2 py-2 border border-slate-400 w-36">รายการ</th>
            <th className="text-center px-2 py-2 border border-slate-400">จำนวนนับ (เขียนมือ)</th>
            <th className="text-center px-2 py-2 border border-slate-400 w-20">ยอดรวม</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.code}>
              <td className="text-center px-2 py-3 border border-slate-400">{idx + 1}</td>
              <td className="px-2 py-3 border border-slate-400 font-mono text-xs">{item.code}</td>
              <td className="px-2 py-3 border border-slate-400">{item.name}</td>
              <td className="px-2 py-3 border border-slate-400">
                {/* Wide blank space for tally marks */}
                <div className="min-h-[28px]"></div>
              </td>
              <td className="px-2 py-3 border border-slate-400">
                {/* Blank for total */}
                <div className="min-h-[28px]"></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
