'use client'

// 374 — ใบส่งรับผ้าเปล่า v2: toggle ชื่อ/วันที่ (374.1/2) · sheetTitle แผนก (374.4) · compact A5 (374.3)
// scan-friendly: ชื่อ+วันที่ printed เด่น · รหัสกำกับทุกแถว · cols ตรงกับ AI scan (362)

import { formatDate } from '@/lib/utils'
import type { Customer, CompanyInfo, LinenItemDef } from '@/types'

interface Props {
  customer: Customer | null
  company: CompanyInfo
  items: LinenItemDef[]
  date: string
  showCustomer?: boolean
  showDate?: boolean
  sheetTitle?: string
  compact?: boolean
  id?: string
}

export default function BlankLinenFormPrint({
  customer, company, items, date,
  showCustomer = true, showDate = true, sheetTitle, compact = false, id = 'print-blank-lf',
}: Props) {
  const pad = compact ? 'p-3' : 'p-8'
  const coTitle = compact ? 'text-sm' : 'text-xl'
  const docTitle = compact ? 'text-sm' : 'text-lg'
  const provVal = compact ? 'text-base' : 'text-2xl'
  const provLabel = compact ? 'text-[9px]' : 'text-[11px]'
  const cellPy = compact ? 'py-1' : 'py-2'
  const tableFont = compact ? '9px' : '11px'

  // 376: print:px-2 print:py-0 — คืน padding ที่ซ้ำกับ @page margin (กันล้นหน้า 2)
  return (
    <div className={`bg-white ${pad} mx-auto print:shadow-none print:px-2 print:py-0 w-full`} id={id}>
      {/* Header */}
      <div className={`flex justify-between items-start border-b-2 border-[#1B3A5C] ${compact ? 'mb-2 pb-2' : 'mb-4 pb-3'}`}>
        <div>
          <h1 className={`${coTitle} font-bold text-[#1B3A5C]`}>{company.name}</h1>
          {!compact && <p className="text-xs text-slate-500">{company.nameEn}</p>}
          {!compact && <p className="text-xs text-slate-500 mt-1">{company.address}</p>}
          <p className={compact ? 'text-[9px] text-slate-500' : 'text-xs text-slate-500'}>โทร: {company.phone}</p>
        </div>
        <div className="text-right">
          <h2 className={`${docTitle} font-bold text-[#1B3A5C]`}>ใบส่ง-รับผ้า</h2>
          {sheetTitle && <p className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-slate-600`}>📋 {sheetTitle}</p>}
        </div>
      </div>

      {/* Provenance: ชื่อลูกค้า + วันที่ (toggle) */}
      <div className={`flex justify-between items-stretch gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
        <div className="flex gap-2">
          <div className={`border-2 border-[#1B3A5C] rounded-lg ${compact ? 'px-2 py-1' : 'px-4 py-2'}`}>
            <p className={`${provLabel} text-slate-500`}>ชื่อลูกค้า</p>
            {showCustomer && customer ? (
              <p className={`font-bold text-slate-900 ${provVal} leading-tight`}>{customer.shortName || customer.name}</p>
            ) : (
              <div className={`${compact ? 'h-6 w-24' : 'h-9 w-36'} border-b-2 border-dotted border-slate-400`}></div>
            )}
          </div>
          <div className={`border-2 border-[#1B3A5C] rounded-lg ${compact ? 'px-2 py-1' : 'px-4 py-2'}`}>
            <p className={`${provLabel} text-slate-500`}>วันที่</p>
            {showDate ? (
              <p className={`font-bold text-slate-900 ${provVal} leading-tight`}>{formatDate(date)}</p>
            ) : (
              <div className={`${compact ? 'h-6 w-20' : 'h-9 w-28'} border-b-2 border-dotted border-slate-400`}></div>
            )}
          </div>
        </div>
        {!compact && <div className="text-xs text-slate-400 self-end">{items.length} รายการ (ตาม QT)</div>}
      </div>

      {/* Items Table — cols ตรงกับ AI scan · รหัสเด่น */}
      <table className={`w-full border-2 border-slate-600 ${compact ? 'mb-2' : 'mb-4'}`} style={{ fontSize: tableFont }}>
        <thead>
          <tr className="bg-[#e8eef5] text-[#1B3A5C]">
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500 w-6`}>#</th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500 ${compact ? 'w-9' : 'w-12'}`}>รหัส</th>
            <th className={`text-left px-1 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500`}>รายการ</th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500 ${compact ? 'w-10' : 'w-14'}`}>ลูกค้า<br />นับส่ง</th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500 ${compact ? 'w-8' : 'w-12'}`}>เคลม</th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500 ${compact ? 'w-10' : 'w-14'}`}>โรงซัก<br />นับเข้า</th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500 ${compact ? 'w-10' : 'w-14'}`}>โรงซัก<br />แพคส่ง</th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500 ${compact ? 'w-10' : 'w-14'}`}>ลูกค้า<br />นับกลับ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.code}>
              <td className={`text-center px-1 ${cellPy} border border-slate-500 text-slate-400`}>{idx + 1}</td>
              <td className={`text-center px-1 ${cellPy} border border-slate-500 font-mono font-bold bg-slate-50`}>{item.code}</td>
              <td className={`px-1 ${cellPy} border border-slate-500`}>{item.name}</td>
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
      <div className={`flex justify-end ${compact ? 'mb-2' : 'mb-4'}`}>
        <div className={`border border-slate-400 rounded ${compact ? 'px-2 py-1 text-[9px]' : 'px-4 py-2 text-xs'} text-center`}>
          <span className="text-slate-500">จำนวนถุงแพคส่ง: </span>
          <span className={`inline-block ${compact ? 'w-10' : 'w-16'} border-b border-dotted border-slate-400`}>&nbsp;</span>
        </div>
      </div>

      {/* Signatures */}
      <div className={`grid grid-cols-2 ${compact ? 'gap-6 mt-3' : 'gap-16 mt-6'} ${compact ? 'text-[9px]' : 'text-xs'} text-center`}>
        <div>
          <div className={`border-b border-slate-400 ${compact ? 'pb-4' : 'pb-7'} mb-1`}></div>
          <p className="text-slate-500">ผู้ส่ง (Sender)</p>
        </div>
        <div>
          <div className={`border-b border-slate-400 ${compact ? 'pb-4' : 'pb-7'} mb-1`}></div>
          <p className="text-slate-500">ผู้รับ (Receiver)</p>
        </div>
      </div>

      {!compact && (
        <div className="mt-6 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
          <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
        </div>
      )}
    </div>
  )
}
