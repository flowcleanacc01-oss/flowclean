'use client'

// 376 — ใบส่ง-รับผ้าเปล่า v3 (Form Designer v3) — match เอกสารเดิม + เงื่อนไขใหม่
//  · 6 data cols: ส่งซักปกติ / ส่งเคลมซัก / ผ้าซักแล้วกลับมา / โรงซักนับเข้า / โรงซักแพคส่ง / หมายเหตุ ค้าง-คืน
//  · 376.2b ความกว้าง: ส่งซักปกติ (กว้างสุด — breakdown) > แพคส่ง (รอง) > อีก 3 ช่องเท่ากัน
//  · 376.4 3 ภาษา (ไทย/อังกฤษ/พม่า) หัวตาราง+ป้าย · item = ไทย+อังกฤษ(+พม่าถ้ามี) · code badge
//  · 376.5 จัดกลุ่มตามหมวด + เส้นหนาคั่น + หัวกลุ่ม
//  · 376.1 density (ปกติ/แน่น/แน่นมาก) + paginate (thead ซ้ำ) · 376.3 เพิ่มแถวว่าง
//  · 2 กล่องนับถุง (ส่งซัก/แพคส่ง) + 385.1 ลายเซ็นแถวเดียว 2 จุด (ลูกค้า | FlowClean) "_ / _" เซ็น 1-2 ครั้งก็ได้

import { formatDate, cn } from '@/lib/utils'
import { FL, DENSITY, type FormLang, type FormDensity, type TriLabel } from '@/lib/form-i18n'
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
  langs?: FormLang[]                 // 376.4 ภาษาที่แสดง · 394.1 ถอดพม่า (เหลือ th/en)
  density?: FormDensity              // 376.1 ความหนาแน่นแถว
  extraRows?: number                 // 376.3 แถวว่างต่อท้าย (ad-hoc)
}

// 385 — column widths (รวม 100%) · รายการ กว้างขึ้น 23→26 (กันตัวหนังสือ wrap หลายบรรทัด)
//   reclaim +3% จากที่ 380 เคยแจกตอน item หด 28→23: packDeliver คืน 2 (16→14), note คืน 1 (12→11)
// 379 — เรียงตาม flow ในโปรแกรม: ลูกค้านับผ้ากลับ (Washed return) ย้ายไปขวาสุด
const COL_W = { no: '4%', item: '26%' }
// 382 — เน้นคอลัมน์สำคัญด้วย "ความกว้าง" ไม่ใช่สีพื้น (ถ่ายเอกสารต่อกันแล้วสีไม่เข้มกลบตัวเลข)
const DATA_COLS: { num: number; label: TriLabel; w: string }[] = [
  { num: 1, label: FL.sendNormal,       w: '21%' },  // ลูกค้านับส่ง (breakdown — กว้างสุด)
  { num: 2, label: FL.sendClaim,        w: '8%' },
  { num: 3, label: FL.countedIn,        w: '8%' },
  { num: 4, label: FL.packDeliver,      w: '14%' },  // โรงซักแพคส่ง (รอง — 385 คืน 2%)
  { num: 5, label: FL.noteRemainReturn, w: '11%' },  // 385 คืน 1%
  { num: 6, label: FL.washedReturn,     w: '8%' },   // 379 — ลูกค้านับผ้ากลับ ขวาสุด
]

// bilingual stack: ไทย (เด่น) / อังกฤษ (รอง) — 394.1 ถอดพม่าออก
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

export default function BlankLinenFormPrint({
  customer, company, items, date,
  showCustomer = true, showDate = true, sheetTitle, compact = false, id = 'print-blank-lf',
  langs = ['th', 'en'], density = 'normal', extraRows = 0,
}: Props) {
  const pad = compact ? 'p-3' : 'p-8'
  const coTitle = compact ? 'text-sm' : 'text-xl'
  const d = DENSITY[density]

  // 394.2 — เอา "จัดกลุ่มตามหมวด" ออก (ติ๊ดวาดปีกกาครอบ aggregate เองมากกว่า) → render รายการเรียงเดียว
  let rowNo = 0

  return (
    // 376: print:px-2 print:py-0 — คืน padding ที่ซ้ำกับ @page margin (กันล้นหน้า 2)
    <div className={`bg-white ${pad} mx-auto print:shadow-none print:px-2 print:py-0 w-full`} id={id}>
      {/* Title */}
      <div className={`flex justify-between items-start border-b-2 border-[#1B3A5C] ${compact ? 'mb-2 pb-1' : 'mb-4 pb-3'}`}>
        <div>
          <h1 className={`${coTitle} font-bold text-[#1B3A5C]`}>{company.name}</h1>
          {!compact && <p className="text-xs text-slate-500">{company.nameEn}</p>}
          <p className={compact ? 'text-[9px] text-slate-500' : 'text-xs text-slate-500'}>โทร: {company.phone}</p>
        </div>
        <div className="text-right">
          <Tri label={FL.docTitleLf} langs={langs} />
          {sheetTitle && <p className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-slate-600`}>📋 {sheetTitle}</p>}
        </div>
      </div>

      {/* Provenance + กล่องนับถุง — แถวเดียว (380.1 ชื่อแคบ/เตี้ย · วันที่กว้างขึ้น · 380.2 ย้ายกล่องนับถุงมารวม)
          393.1 — กล่องหัว 4 ใบ กลับไปขนาดเดิม (เตี้ย+ฟอนต์เล็ก) แม้โหมด A4 เดี่ยว: ติ๊ดเห็นว่าความสูงเดิมพอแล้ว ไม่ต้องสูง text-2xl/h-9 */}
      <div className={`flex items-stretch gap-1.5 ${compact ? 'mb-2' : 'mb-3'}`}>
        <div className="border-2 border-[#1B3A5C] rounded-lg w-[32%] px-2 py-0.5 text-[10px]">
          <Tri label={FL.customer} langs={langs} />
          {showCustomer && customer ? (
            <p className="font-bold text-slate-900 leading-tight truncate text-sm">{customer.shortName || customer.name}</p>
          ) : (
            <div className="border-b-2 border-dotted border-slate-400 h-4"></div>
          )}
        </div>
        <div className="border-2 border-[#1B3A5C] rounded-lg w-[22%] px-2 py-0.5 text-[10px]">
          <Tri label={FL.date} langs={langs} />
          {showDate ? (
            <p className="font-bold text-slate-900 leading-tight text-sm">{formatDate(date)}</p>
          ) : (
            <div className="border-b-2 border-dotted border-slate-400 h-4"></div>
          )}
        </div>
        {[FL.sacksForWashing, FL.packBagsDelivery].map((box, i) => (
          <div key={i} className={cn('border border-slate-500 rounded flex-1 flex flex-col justify-center leading-none', compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]')}>
            <Tri label={box} langs={langs} />
            <div className="flex items-center gap-1 mt-0.5">
              <span className="font-bold">=</span>
              <span className="flex-1 border-b border-dotted border-slate-500">&nbsp;</span>
            </div>
          </div>
        ))}
      </div>

      {/* Items Table — 8 cols · trilingual head · thead ซ้ำตอน paginate */}
      <table className={`blank-form-table w-full border-2 border-slate-600 ${compact ? 'mb-2' : 'mb-4'}`} style={{ fontSize: `${d.fontPx}px`, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: COL_W.no }} />
          <col style={{ width: COL_W.item }} />
          {DATA_COLS.map(c => <col key={c.num} style={{ width: c.w }} />)}
        </colgroup>
        <thead>
          {/* 380.3 เอาแถว (ลูกค้ากรอก) ออก · 380.5 header row เตี้ยลง (py-0.5 + leading-none) */}
          <tr className="text-[#1B3A5C] align-bottom leading-none">
            <th className={`text-center px-0.5 ${compact ? 'py-0.5' : 'py-1.5'} border border-slate-500`}><Tri label={FL.no} langs={langs} center /></th>
            <th className={`text-left px-1 ${compact ? 'py-0.5' : 'py-1.5'} border border-slate-500`}><Tri label={FL.item} langs={langs} /></th>
            {DATA_COLS.map(c => (
              <th key={c.num} className={cn('text-center px-0.5 border border-slate-500', compact ? 'py-0.5' : 'py-1.5')}>
                <span className="block text-[0.8em] opacity-60">{c.num}</span>
                <Tri label={c.label} langs={langs} center />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            rowNo++
            return (
              <tr key={item.code}>
                <td className={`text-center px-0.5 ${d.cellPy} border border-slate-500 text-slate-400`}>{rowNo}</td>
                <td className={`px-1 ${d.cellPy} border border-slate-500`}>
                  <div className="flex items-start justify-between gap-1">
                    <span className="min-w-0 leading-tight">
                      {langs.includes('th') && <span className="block font-medium leading-tight">{item.name}</span>}
                      {langs.includes('en') && item.nameEn && <span className="block opacity-60 leading-tight" style={{ fontSize: '0.82em' }}>{item.nameEn}</span>}
                    </span>
                    <span className="flex-shrink-0 font-mono font-bold border border-slate-400 rounded px-1 leading-tight">{item.code}</span>
                  </div>
                </td>
                {DATA_COLS.map(c => <td key={c.num} className="border border-slate-500"></td>)}
              </tr>
            )
          })}
          {/* 376.3 — แถวว่าง ad-hoc */}
          {Array.from({ length: Math.max(0, extraRows) }).map((_, i) => {
            rowNo++
            return (
              <tr key={`blank-${i}`}>
                <td className={`text-center px-0.5 ${d.cellPy} border border-slate-500 text-slate-300`}>{rowNo}</td>
                <td className={`border border-slate-500 ${d.cellPy}`}></td>
                {DATA_COLS.map(c => <td key={c.num} className="border border-slate-500"></td>)}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 385.1 — ลายเซ็นแถวเดียว 2 จุด (ลูกค้า | FlowClean) · "_ / _" = เซ็น 1 หรือ 2 ครั้งก็ได้
          ไม่ระบุ ส่งซัก/รับกลับ — บางลูกค้าเซ็นครั้งเดียว, กัน audit ไม่ผ่านเพราะลายเซ็นไม่ครบ 4 จุด */}
      <div className={`grid grid-cols-2 ${compact ? 'gap-x-8 mt-4 text-[9px]' : 'gap-x-16 mt-8 text-xs'}`}>
        <div className="flex items-end gap-2 min-w-0">
          <span className="flex-shrink-0"><Tri label={FL.signCustomer} langs={langs} /></span>
          <span className={`flex-1 border-b border-slate-400 ${compact ? 'pb-3' : 'pb-6'}`}></span>
          <span className="flex-shrink-0 text-slate-400">/</span>
          <span className={`flex-1 border-b border-slate-400 ${compact ? 'pb-3' : 'pb-6'}`}></span>
        </div>
        <div className="flex items-end gap-2 min-w-0">
          <span className="flex-shrink-0 font-semibold">FlowClean</span>
          <span className={`flex-1 border-b border-slate-400 ${compact ? 'pb-3' : 'pb-6'}`}></span>
          <span className="flex-shrink-0 text-slate-400">/</span>
          <span className={`flex-1 border-b border-slate-400 ${compact ? 'pb-3' : 'pb-6'}`}></span>
        </div>
      </div>

      {/* 391 — เอา footer "เอกสารนี้ออกโดยระบบ FlowClean" + เส้นคั่นออก (ติ๊ดขอ ฟอร์มสะอาดขึ้น) */}
    </div>
  )
}
