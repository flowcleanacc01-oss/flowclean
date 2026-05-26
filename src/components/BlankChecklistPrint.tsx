'use client'

// 374 — ใบเช็คผ้าเปล่า v2: toggle ชื่อ/วันที่ (374.1/2) · sheetTitle แผนก (374.4) · compact สำหรับ A5 2-up (374.3)
// scan-friendly: ชื่อ+วันที่ printed เด่น (provenance แม่น) · รหัสกำกับทุกแถว · บอกพนักงานเขียนตามสี

import { formatDate } from '@/lib/utils'
import type { Customer, CompanyInfo, LinenItemDef } from '@/types'

interface BlankChecklistPrintProps {
  customer: Customer | null            // null = ฟอร์มกลาง (ไม่ระบุลูกค้า)
  company: CompanyInfo
  items: LinenItemDef[]
  date: string
  showCustomer?: boolean               // 374.1 — false = เว้นช่องเขียนมือ
  showDate?: boolean                   // 374.2 — false = เว้นช่องเขียนมือ
  sheetTitle?: string                  // 374.4 — ชื่อใบ/แผนก เช่น "ผ้าเรียบ"
  compact?: boolean                    // 374.3 — A5 mode (font/ระยะเล็กลง fit A5)
  id?: string                          // print target id (unique เมื่อ render หลายใบ)
}

export default function BlankChecklistPrint({
  customer, company, items, date,
  showCustomer = true, showDate = true, sheetTitle, compact = false, id = 'print-blank-checklist',
}: BlankChecklistPrintProps) {
  // ระยะ/ขนาดตาม compact (A5) vs ปกติ (A4)
  const pad = compact ? 'p-3' : 'p-8'
  const coTitle = compact ? 'text-sm' : 'text-xl'
  const docTitle = compact ? 'text-sm' : 'text-lg'
  const provVal = compact ? 'text-base' : 'text-2xl'
  const provLabel = compact ? 'text-[9px]' : 'text-[11px]'
  const cellPy = compact ? 'py-1.5' : 'py-3'
  const fontSz = compact ? 'text-[11px]' : 'text-sm'

  // 376: print:px-2 print:py-0 — คืน padding ที่ซ้ำกับ @page margin (กันล้นหน้า 2)
  return (
    <div className={`bg-white ${pad} mx-auto ${fontSz} print:shadow-none print:px-2 print:py-0 w-full`} id={id}>
      {/* Header */}
      <div className={`flex justify-between items-start border-b-2 border-[#1B3A5C] ${compact ? 'mb-2 pb-2' : 'mb-4 pb-3'}`}>
        <div>
          <h1 className={`${coTitle} font-bold text-[#1B3A5C]`}>{company.name}</h1>
          {!compact && <p className="text-xs text-slate-500">{company.nameEn}</p>}
          {!compact && <p className="text-xs text-slate-500 mt-1">{company.address}</p>}
          <p className={compact ? 'text-[9px] text-slate-500' : 'text-xs text-slate-500'}>โทร: {company.phone}</p>
        </div>
        <div className="text-right">
          <h2 className={`${docTitle} font-bold text-[#1B3A5C]`}>ใบเช็คผ้า</h2>
          {sheetTitle && <p className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-slate-600`}>📋 {sheetTitle}</p>}
        </div>
      </div>

      {/* Provenance: ชื่อลูกค้า + วันที่ (toggle) → printed เด่น หรือ เว้นช่องเขียนมือ */}
      <div className={`flex justify-between items-stretch gap-2 ${compact ? 'mb-2' : 'mb-4'}`}>
        <div className="flex gap-2 flex-1">
          <div className={`border-2 border-[#1B3A5C] rounded-lg ${compact ? 'px-2 py-1' : 'px-4 py-2'} flex-1`}>
            <p className={`${provLabel} text-slate-500`}>ชื่อลูกค้า</p>
            {showCustomer && customer ? (
              <>
                <p className={`font-bold text-slate-900 ${provVal} leading-tight`}>{customer.shortName || customer.name}</p>
                {!compact && customer.shortName && customer.name && customer.name !== customer.shortName && (
                  <p className="text-[10px] text-slate-400">{customer.name}</p>
                )}
              </>
            ) : (
              <div className={`${compact ? 'h-6' : 'h-9'} border-b-2 border-dotted border-slate-400`}></div>
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
        <div className={`border-2 border-[#1B3A5C] rounded-lg ${compact ? 'px-2 py-1' : 'px-5 py-2'} text-center`}>
          <p className={`${provLabel} font-medium text-[#1B3A5C] mb-1`}>จำนวนถุง</p>
          <div className={`${compact ? 'w-12 h-5' : 'w-20 h-9'} border-b-2 border-dotted border-slate-400 mx-auto`}></div>
        </div>
      </div>

      {/* Items Table — รหัสเด่น + ระบุสีที่ให้พนักงานเขียน */}
      <table className={`w-full ${fontSz} border-2 border-slate-600 mb-1`}>
        <thead>
          <tr className="bg-[#e8eef5]">
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-2'} border border-slate-500 w-6`}>#</th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-2'} border border-slate-500 ${compact ? 'w-10' : 'w-14'}`}>รหัส</th>
            <th className={`text-left px-1 ${compact ? 'py-1' : 'py-2'} border border-slate-500`}>รายการ</th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-2'} border border-slate-500 ${compact ? 'w-14' : 'w-24'}`}>นับส่ง <span className="text-red-600">{compact ? '(แดง)' : '(สีแดง)'}</span></th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-2'} border border-slate-500`}>ต่อถุง — แพคส่ง <span className="text-blue-600">{compact ? '(น้ำเงิน)' : '(สีน้ำเงิน)'}</span>{!compact && <><br /><span className="text-[9px] font-normal text-slate-500">หลายถุงคั่นด้วย + เช่น 43+36</span></>}</th>
            <th className={`text-center px-1 ${compact ? 'py-1' : 'py-2'} border border-slate-500 ${compact ? 'w-10' : 'w-16'}`}>รวม</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.code}>
              <td className={`text-center px-1 ${cellPy} border border-slate-500 text-slate-400`}>{idx + 1}</td>
              <td className={`text-center px-1 ${cellPy} border border-slate-500 font-mono font-bold bg-slate-50`}>{item.code}</td>
              <td className={`px-1 ${cellPy} border border-slate-500`}>{item.name}</td>
              <td className={`px-1 ${cellPy} border border-slate-500`}></td>
              <td className={`px-1 ${cellPy} border border-slate-500`}><div className={compact ? 'min-h-[18px]' : 'min-h-[30px]'}></div></td>
              <td className={`px-1 ${cellPy} border border-slate-500`}></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`${compact ? 'text-[8px]' : 'text-[10px]'} text-slate-400 ${compact ? 'mb-2' : 'mb-4'}`}>💡 <span className="text-red-600 font-medium">นับส่ง=ปากกาแดง</span> · <span className="text-blue-600 font-medium">ต่อถุง=ปากกาน้ำเงิน</span> — ช่วยให้สแกนแม่นขึ้น</p>

      {/* Signatures */}
      <div className={`grid grid-cols-2 ${compact ? 'gap-6 mt-3' : 'gap-16 mt-8'} ${compact ? 'text-[9px]' : 'text-xs'} text-center`}>
        <div>
          <div className={`border-b border-slate-400 ${compact ? 'pb-4' : 'pb-8'} mb-1`}></div>
          <p className="text-slate-500">ผู้ส่ง (Sender)</p>
        </div>
        <div>
          <div className={`border-b border-slate-400 ${compact ? 'pb-4' : 'pb-8'} mb-1`}></div>
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
