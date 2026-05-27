'use client'

// 376 — ใบส่ง-รับผ้าเปล่า v3 (Form Designer v3) — match เอกสารเดิม + เงื่อนไขใหม่
//  · 6 data cols: ส่งซักปกติ / ส่งเคลมซัก / ผ้าซักแล้วกลับมา / โรงซักนับเข้า / โรงซักแพคส่ง / หมายเหตุ ค้าง-คืน
//  · 376.2b ความกว้าง: ส่งซักปกติ (กว้างสุด — breakdown) > แพคส่ง (รอง) > อีก 3 ช่องเท่ากัน
//  · 376.4 3 ภาษา (ไทย/อังกฤษ/พม่า) หัวตาราง+ป้าย · item = ไทย+อังกฤษ(+พม่าถ้ามี) · code badge
//  · 376.5 จัดกลุ่มตามหมวด + เส้นหนาคั่น + หัวกลุ่ม
//  · 376.1 density (ปกติ/แน่น/แน่นมาก) + paginate (thead ซ้ำ) · 376.3 เพิ่มแถวว่าง
//  · 2 กล่องนับถุง (ส่งซัก/แพคส่ง) + 385.1 ลายเซ็นแถวเดียว 2 จุด (ลูกค้า | FlowClean) "_ / _" เซ็น 1-2 ครั้งก็ได้

import { Fragment } from 'react'
import { formatDate, cn } from '@/lib/utils'
import { FL, DENSITY, BURMESE_ITEM, type FormLang, type FormDensity, type TriLabel } from '@/lib/form-i18n'
import type { Customer, CompanyInfo, LinenItemDef, LinenCategoryDef } from '@/types'

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
  langs?: FormLang[]                 // 376.4 ภาษาที่แสดง (default ทั้ง 3)
  density?: FormDensity              // 376.1 ความหนาแน่นแถว
  extraRows?: number                 // 376.3 แถวว่างต่อท้าย (ad-hoc)
  grouped?: boolean                  // 376.5 จัดกลุ่มตามหมวด
  categories?: LinenCategoryDef[]
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

// trilingual stack: ไทย (เด่น) / อังกฤษ (รอง) / พม่า (.font-my ถ้ามี)
function Tri({ label, langs, center }: { label: TriLabel; langs: FormLang[]; center?: boolean }) {
  return (
    <span className={cn('block leading-tight', center && 'text-center')}>
      {langs.map((l, i) => {
        const txt = label[l]
        if (!txt) return null
        return (
          <span key={l} className={cn('block leading-tight', i === 0 ? 'font-semibold' : 'opacity-70', l === 'my' && 'font-my')}
            style={i > 0 ? { fontSize: '0.82em' } : undefined}>{txt}</span>
        )
      })}
    </span>
  )
}

function myItemName(item: LinenItemDef): string {
  return item.nameMy || BURMESE_ITEM[item.code] || ''
}

export default function BlankLinenFormPrint({
  customer, company, items, date,
  showCustomer = true, showDate = true, sheetTitle, compact = false, id = 'print-blank-lf',
  langs = ['th', 'en', 'my'], density = 'normal', extraRows = 0, grouped = false, categories = [],
}: Props) {
  const pad = compact ? 'p-3' : 'p-8'
  const coTitle = compact ? 'text-sm' : 'text-xl'
  const d = DENSITY[density]

  // 376.5 — จัดกลุ่มตามหมวด (เรียงตาม category sortOrder) หรือลำดับเดิม
  const sortedCats = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
  const groups: { label: string; items: LinenItemDef[] }[] = []
  if (grouped && sortedCats.length) {
    for (const c of sortedCats) {
      const gItems = items.filter(i => i.category === c.key)
      if (gItems.length) groups.push({ label: c.label, items: gItems })
    }
    const known = new Set(sortedCats.map(c => c.key))
    const orphans = items.filter(i => !known.has(i.category))
    if (orphans.length) groups.push({ label: 'อื่นๆ', items: orphans })
  } else {
    groups.push({ label: '', items })
  }

  // running row number ข้ามกลุ่ม
  let rowNo = 0
  const colCount = 2 + DATA_COLS.length  // no + item + 6 = 8

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

      {/* Provenance + กล่องนับถุง — แถวเดียว (380.1 ชื่อแคบ/เตี้ย · วันที่กว้างขึ้น · 380.2 ย้ายกล่องนับถุงมารวม) */}
      <div className={`flex items-stretch gap-1.5 ${compact ? 'mb-2' : 'mb-3'}`}>
        <div className={cn('border-2 border-[#1B3A5C] rounded-lg w-[32%]', compact ? 'px-2 py-0.5 text-[10px]' : 'px-4 py-2')}>
          <Tri label={FL.customer} langs={langs} />
          {showCustomer && customer ? (
            <p className={cn('font-bold text-slate-900 leading-tight truncate', compact ? 'text-sm' : 'text-2xl')}>{customer.shortName || customer.name}</p>
          ) : (
            <div className={cn('border-b-2 border-dotted border-slate-400', compact ? 'h-4' : 'h-9')}></div>
          )}
        </div>
        <div className={cn('border-2 border-[#1B3A5C] rounded-lg w-[22%]', compact ? 'px-2 py-0.5 text-[10px]' : 'px-4 py-2')}>
          <Tri label={FL.date} langs={langs} />
          {showDate ? (
            <p className={cn('font-bold text-slate-900 leading-tight', compact ? 'text-sm' : 'text-2xl')}>{formatDate(date)}</p>
          ) : (
            <div className={cn('border-b-2 border-dotted border-slate-400', compact ? 'h-4' : 'h-9')}></div>
          )}
        </div>
        {[FL.sacksForWashing, FL.packBagsDelivery].map((box, i) => (
          <div key={i} className={cn('border border-slate-500 rounded flex-1 flex flex-col justify-center leading-none', compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-1 text-[10px]')}>
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
          {groups.map((g, gi) => (
            <Fragment key={gi}>
              {/* 376.5 — หัวกลุ่ม + เส้นหนาคั่น */}
              {g.label && (
                <tr className="blank-form-group">
                  <td colSpan={colCount} className={`border-x border-slate-500 border-t-2 border-t-slate-700 font-semibold text-slate-700 px-1.5 ${compact ? 'py-0.5' : 'py-1'}`}>
                    ▸ {g.label}
                  </td>
                </tr>
              )}
              {g.items.map(item => {
                rowNo++
                const my = myItemName(item)
                return (
                  <tr key={item.code}>
                    <td className={`text-center px-0.5 ${d.cellPy} border border-slate-500 text-slate-400`}>{rowNo}</td>
                    <td className={`px-1 ${d.cellPy} border border-slate-500`}>
                      <div className="flex items-start justify-between gap-1">
                        <span className="min-w-0 leading-tight">
                          {langs.includes('th') && <span className="block font-medium leading-tight">{item.name}</span>}
                          {langs.includes('en') && item.nameEn && <span className="block opacity-60 leading-tight" style={{ fontSize: '0.82em' }}>{item.nameEn}</span>}
                          {langs.includes('my') && my && <span className="block font-my opacity-60 leading-tight" style={{ fontSize: '0.82em' }}>{my}</span>}
                        </span>
                        <span className="flex-shrink-0 font-mono font-bold border border-slate-400 rounded px-1 leading-tight">{item.code}</span>
                      </div>
                    </td>
                    {DATA_COLS.map(c => <td key={c.num} className="border border-slate-500"></td>)}
                  </tr>
                )
              })}
            </Fragment>
          ))}
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

      {!compact && (
        <div className="mt-6 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
          <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
        </div>
      )}
    </div>
  )
}
