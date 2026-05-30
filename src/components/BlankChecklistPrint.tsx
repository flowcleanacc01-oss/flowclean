'use client'

// 376 — ใบเช็คผ้าเปล่า v3 (Form Designer v3)
//  · 389.5 คอลัมน์ใหม่: # / รายการ(+code) / นับส่ง(แดง) / เคลม(แดง) / ต่อถุง-แพคส่ง(น้ำเงิน)
//    (ลบ "รวม" ออก · เพิ่ม "เคลม" คั่นระหว่าง send กับ pack)
//  · 376.4 3 ภาษา (ไทย/อังกฤษ/พม่า) · 376.5 จัดกลุ่ม+เส้นหนา · 376.1 density · 376.3 แถวว่าง
//  · scan-friendly: code เด่นทุกแถว + สีปากกา (แดง/น้ำเงิน) ช่วย AI สแกนแม่น

import { formatDate, cn } from '@/lib/utils'
import { FL, type FormLang, type TriLabel } from '@/lib/form-i18n'
import type { Customer, CompanyInfo, LinenItemDef } from '@/types'

interface BlankChecklistPrintProps {
  customer: Customer | null
  company: CompanyInfo
  items: LinenItemDef[]
  date: string
  showCustomer?: boolean
  showDate?: boolean
  sheetTitle?: string
  compact?: boolean
  id?: string
  langs?: FormLang[]
  rowHeightPx: number     // 396.2 ความสูงแถว (fit-to-page) — แทน density
  fontPx: number          // 396.2 ฟอนต์ตาราง
  extraRows?: number
}

// 389 — column widths (รวม 100%) · "ต่อถุง-แพคส่ง" กว้างขึ้น (พอเขียน 43+36+... แบบหลายถุง)
//   389.1 send 18→12 (เท่ากับ "รวม" เดิม) · 389.2 item 40→36 (-4 "นิดนึง") · 389.5 ลบ total +เพิ่ม claim (สมมาตร red pair)
const COL_W = { no: '5%', item: '36%', send: '12%', claim: '12%', pack: '35%' }

function Tri({ label, langs, center }: { label: TriLabel; langs: FormLang[]; center?: boolean }) {
  return (
    <span className={cn('block leading-tight', center && 'text-center')}>
      {langs.map((l, i) => {
        const txt = label[l]
        if (!txt) return null
        return (
          <span key={l} className={cn('block leading-tight', i === 0 ? 'font-semibold' : 'opacity-70')}
            style={i > 0 ? { fontSize: '0.82em' } : undefined}>{txt}</span>
        )
      })}
    </span>
  )
}

export default function BlankChecklistPrint({
  customer, company, items, date,
  showCustomer = true, showDate = true, sheetTitle, compact = false, id = 'print-blank-checklist',
  langs = ['th', 'en'], rowHeightPx, fontPx, extraRows = 0,
}: BlankChecklistPrintProps) {
  const pad = compact ? 'p-3' : 'p-8'
  const coTitle = compact ? 'text-sm' : 'text-xl'
  const provVal = compact ? 'text-sm' : 'text-2xl'   // 383 — เตี้ยลงให้ฟิต 2-up

  // 394.2 — เอา "จัดกลุ่มตามหมวด" ออก → render รายการเรียงเดียว
  let rowNo = 0

  return (
    // 376: print:px-2 print:py-0 — คืน padding ที่ซ้ำกับ @page margin (กันล้นหน้า 2)
    <div className={`bg-white ${pad} mx-auto print:shadow-none print:px-2 print:py-0 w-full`} id={id} style={{ fontSize: `${fontPx}px` }}>
      {/* Header */}
      <div className={`flex justify-between items-start border-b-2 border-[#1B3A5C] ${compact ? 'mb-2 pb-1' : 'mb-4 pb-3'}`}>
        <div>
          <h1 className={`${coTitle} font-bold text-[#1B3A5C]`}>{company.name}</h1>
          {!compact && <p className="text-xs text-slate-500">{company.nameEn}</p>}
          <p className={compact ? 'text-[9px] text-slate-500' : 'text-xs text-slate-500'}>โทร: {company.phone}</p>
        </div>
        <div className="text-right">
          <Tri label={FL.docTitleCk} langs={langs} />
          {sheetTitle && <p className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-slate-600`}>📋 {sheetTitle}</p>}
        </div>
      </div>

      {/* Provenance: ชื่อลูกค้า + วันที่ + จำนวนถุง (383 — เตี้ยลง: py-0.5 + label เล็ก + value text-sm) */}
      <div className={`flex justify-between items-stretch gap-2 ${compact ? 'mb-1.5' : 'mb-4'}`}>
        <div className="flex gap-2 flex-1">
          <div className={`border-2 border-[#1B3A5C] rounded-lg flex-1 ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-4 py-2'}`}>
            <Tri label={FL.customer} langs={langs} />
            {showCustomer && customer ? (
              <p className={`font-bold text-slate-900 ${provVal} leading-tight truncate`}>{customer.shortName || customer.name}</p>
            ) : (
              <div className={`${compact ? 'h-4' : 'h-9'} border-b-2 border-dotted border-slate-400`}></div>
            )}
          </div>
          <div className={`border-2 border-[#1B3A5C] rounded-lg ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-4 py-2'}`}>
            <Tri label={FL.date} langs={langs} />
            {showDate ? (
              <p className={`font-bold text-slate-900 ${provVal} leading-tight`}>{formatDate(date)}</p>
            ) : (
              <div className={`${compact ? 'h-4 w-20' : 'h-9 w-28'} border-b-2 border-dotted border-slate-400`}></div>
            )}
          </div>
        </div>
        {/* 392.1 — จัดข้อความชิดซ้าย เหมือนกล่องวันที่ (เอา text-center / center / mx-auto ออก) */}
        <div className={`border-2 border-[#1B3A5C] rounded-lg ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-5 py-2'}`}>
          <Tri label={FL.bagCount} langs={langs} />
          <div className={`${compact ? 'w-12 h-4' : 'w-20 h-9'} border-b-2 border-dotted border-slate-400`}></div>
        </div>
      </div>

      {/* Items Table */}
      <table className="blank-form-table w-full border-2 border-slate-600 mb-1" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: COL_W.no }} />
          <col style={{ width: COL_W.item }} />
          <col style={{ width: COL_W.send }} />
          <col style={{ width: COL_W.claim }} />
          <col style={{ width: COL_W.pack }} />
        </colgroup>
        <thead>
          <tr className="align-bottom leading-none">
            <th className={`text-center px-0.5 ${compact ? 'py-0.5' : 'py-2'} border border-slate-500`}><Tri label={FL.no} langs={langs} center /></th>
            <th className={`text-left px-1 ${compact ? 'py-0.5' : 'py-2'} border border-slate-500`}><Tri label={FL.item} langs={langs} /></th>
            <th className={`text-center px-0.5 ${compact ? 'py-0.5' : 'py-2'} border border-slate-500`}>
              <Tri label={FL.ckCountSend} langs={langs} center />
              <span className="block text-red-600 text-[0.8em]">{compact ? '(แดง)' : '(สีแดง)'}</span>
            </th>
            <th className={`text-center px-0.5 ${compact ? 'py-0.5' : 'py-2'} border border-slate-500`}>
              <Tri label={FL.ckClaim} langs={langs} center />
              <span className="block text-red-600 text-[0.8em]">{compact ? '(แดง)' : '(สีแดง)'}</span>
            </th>
            <th className={`text-center px-0.5 ${compact ? 'py-0.5' : 'py-2'} border border-slate-500`}>
              <Tri label={FL.ckPerBagPack} langs={langs} center />
              <span className="block text-blue-600 text-[0.8em]">{compact ? '(น้ำเงิน · คั่น +)' : '(สีน้ำเงิน · หลายถุงคั่น + เช่น 43+36)'}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {/* 396.2 — ความสูงแถว = rowHeightPx (fit-to-page) บน cell แรก · td vertical-align:top (globals) */}
          {items.map(item => {
            rowNo++
            return (
              <tr key={item.code}>
                <td className="text-center px-0.5 py-0.5 border border-slate-500 text-slate-400" style={{ height: `${rowHeightPx}px` }}>{rowNo}</td>
                <td className="px-1 py-0.5 border border-slate-500">
                  <div className="flex items-start justify-between gap-1">
                    <span className="min-w-0 leading-none">
                      {langs.includes('th') && <span className="block font-medium leading-none">{item.name}</span>}
                      {langs.includes('en') && item.nameEn && <span className="block opacity-60 leading-none" style={{ fontSize: '0.82em' }}>{item.nameEn}</span>}
                    </span>
                    <span className="flex-shrink-0 font-mono font-bold border border-slate-400 rounded px-1 leading-tight">{item.code}</span>
                  </div>
                </td>
                <td className="px-1 border border-slate-500"></td>{/* send (แดง) */}
                <td className="px-1 border border-slate-500"></td>{/* 389.5 claim (แดง) */}
                <td className="px-1 border border-slate-500"></td>{/* pack (น้ำเงิน) — ความสูงจาก rowHeightPx */}
              </tr>
            )
          })}
          {Array.from({ length: Math.max(0, extraRows) }).map((_, i) => {
            rowNo++
            return (
              <tr key={`blank-${i}`}>
                <td className="text-center px-0.5 py-0.5 border border-slate-500 text-slate-300" style={{ height: `${rowHeightPx}px` }}>{rowNo}</td>
                <td className="border border-slate-500"></td>
                <td className="border border-slate-500"></td>
                <td className="border border-slate-500"></td>
                <td className="border border-slate-500"></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className={`${compact ? 'text-[8px]' : 'text-[10px]'} text-slate-400 ${compact ? 'mb-1' : 'mb-4'}`}>
        💡 <span className="text-red-600 font-medium">นับส่ง = ปากกาแดง</span> · <span className="text-blue-600 font-medium">ต่อถุง = ปากกาน้ำเงิน</span> — ช่วยให้สแกนแม่นขึ้น
      </p>

      {/* 392 — เอา pattern ลายเซ็น (ผู้ส่ง/ผู้รับ) ออก ตามที่ติ๊ดขอ
          391 — เอา footer "เอกสารนี้ออกโดยระบบ FlowClean" + เส้นคั่นออกด้วย (ให้เหมือนฟอร์ม LF) */}
    </div>
  )
}
