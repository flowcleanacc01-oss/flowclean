'use client'

// 376 — ใบส่ง-รับผ้าเปล่า v3 (Form Designer v3) — match เอกสารเดิม + เงื่อนไขใหม่
//  · 6 data cols: ส่งซักปกติ / ส่งเคลมซัก / ผ้าซักแล้วกลับมา / โรงซักนับเข้า / โรงซักแพคส่ง / หมายเหตุ ค้าง-คืน
//  · 376.2b ความกว้าง: ส่งซักปกติ (กว้างสุด — breakdown) > แพคส่ง (รอง) > อีก 3 ช่องเท่ากัน
//  · 376.4 3 ภาษา (ไทย/อังกฤษ/พม่า) หัวตาราง+ป้าย · item = ไทย+อังกฤษ(+พม่าถ้ามี) · code badge
//  · 376.5 จัดกลุ่มตามหมวด + เส้นหนาคั่น + หัวกลุ่ม
//  · 376.1 density (ปกติ/แน่น/แน่นมาก) + paginate (thead ซ้ำ) · 376.3 เพิ่มแถวว่าง
//  · 2 กล่องนับถุง (ส่งซัก/แพคส่ง) + 4 ลายเซ็น bidirectional

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

// 376.2b — column widths (รวม 100%) · ส่งซักปกติ กว้างสุด, แพคส่ง รอง
const COL_W = { no: '4%', item: '28%', c1: '19%', c2: '8%', c3: '8%', c4: '8%', c5: '14%', c6: '11%' }
const DATA_COLS: { num: number; label: TriLabel; w: string; customerFill?: boolean; emphasize?: boolean }[] = [
  { num: 1, label: FL.sendNormal, w: COL_W.c1, customerFill: true, emphasize: true },
  { num: 2, label: FL.sendClaim, w: COL_W.c2, customerFill: true },
  { num: 3, label: FL.washedReturn, w: COL_W.c3 },
  { num: 4, label: FL.countedIn, w: COL_W.c4 },
  { num: 5, label: FL.packDeliver, w: COL_W.c5, emphasize: true },
  { num: 6, label: FL.noteRemainReturn, w: COL_W.c6 },
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
  const docTitle = compact ? 'text-sm' : 'text-lg'
  const provVal = compact ? 'text-base' : 'text-2xl'
  const provLabel = compact ? 'text-[9px]' : 'text-[11px]'
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
      {/* Header: 2 กล่องนับถุง (376 match เอกสารเดิม) */}
      <div className={`flex justify-end gap-2 ${compact ? 'mb-1' : 'mb-2'}`}>
        {[FL.sacksForWashing, FL.packBagsDelivery].map((box, i) => (
          <div key={i} className={`border border-slate-500 rounded ${compact ? 'px-2 py-0.5' : 'px-3 py-1'} flex items-center gap-1`}>
            <Tri label={box} langs={langs} />
            <span className="font-bold">=</span>
            <span className={`inline-block ${compact ? 'w-10' : 'w-16'} border-b border-dotted border-slate-500`}>&nbsp;</span>
          </div>
        ))}
      </div>

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

      {/* Provenance: ชื่อลูกค้า + วันที่ */}
      <div className={`flex gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
        <div className={`border-2 border-[#1B3A5C] rounded-lg ${compact ? 'px-2 py-1' : 'px-4 py-2'} flex-1`}>
          <Tri label={FL.customer} langs={langs} />
          {showCustomer && customer ? (
            <p className={`font-bold text-slate-900 ${provVal} leading-tight`}>{customer.shortName || customer.name}</p>
          ) : (
            <div className={`${compact ? 'h-6' : 'h-9'} border-b-2 border-dotted border-slate-400`}></div>
          )}
        </div>
        <div className={`border-2 border-[#1B3A5C] rounded-lg ${compact ? 'px-2 py-1' : 'px-4 py-2'}`}>
          <Tri label={FL.date} langs={langs} />
          {showDate ? (
            <p className={`font-bold text-slate-900 ${provVal} leading-tight`}>{formatDate(date)}</p>
          ) : (
            <div className={`${compact ? 'h-6 w-20' : 'h-9 w-28'} border-b-2 border-dotted border-slate-400`}></div>
          )}
        </div>
      </div>

      {/* Items Table — 8 cols · trilingual head · thead ซ้ำตอน paginate */}
      <table className={`blank-form-table w-full border-2 border-slate-600 ${compact ? 'mb-2' : 'mb-4'}`} style={{ fontSize: `${d.fontPx}px`, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: COL_W.no }} />
          <col style={{ width: COL_W.item }} />
          {DATA_COLS.map(c => <col key={c.num} style={{ width: c.w }} />)}
        </colgroup>
        <thead>
          {/* (ลูกค้ากรอก) เหนือ col 1-2 */}
          <tr className="bg-[#e8eef5] text-[#1B3A5C]">
            <th className="border border-slate-500" colSpan={2}></th>
            <th className="border border-slate-500 px-1 py-0.5" colSpan={DATA_COLS.filter(c => c.customerFill).length}>
              <Tri label={FL.customerFills} langs={langs} center />
            </th>
            <th className="border border-slate-500" colSpan={DATA_COLS.filter(c => !c.customerFill).length}></th>
          </tr>
          <tr className="bg-[#e8eef5] text-[#1B3A5C] align-bottom">
            <th className={`text-center px-0.5 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500`}><Tri label={FL.no} langs={langs} center /></th>
            <th className={`text-left px-1 ${compact ? 'py-1' : 'py-1.5'} border border-slate-500`}><Tri label={FL.item} langs={langs} /></th>
            {DATA_COLS.map(c => (
              <th key={c.num} className={cn('text-center px-0.5 border border-slate-500', compact ? 'py-1' : 'py-1.5', c.emphasize && 'bg-[#d9e4f0]')}>
                <span className="block text-[0.85em] opacity-60">{c.num}</span>
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
                  <td colSpan={colCount} className={`border-x border-slate-500 border-t-2 border-t-slate-700 bg-slate-100 font-semibold text-slate-700 px-1.5 ${compact ? 'py-0.5' : 'py-1'}`}>
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
                        <span className="flex-shrink-0 font-mono font-bold bg-slate-100 border border-slate-300 rounded px-1 leading-tight">{item.code}</span>
                      </div>
                    </td>
                    {DATA_COLS.map(c => <td key={c.num} className={cn('border border-slate-500', c.emphasize && 'bg-slate-50/60')}></td>)}
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
                {DATA_COLS.map(c => <td key={c.num} className={cn('border border-slate-500', c.emphasize && 'bg-slate-50/60')}></td>)}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 4 ลายเซ็น — bidirectional (ส่ง-รับ 2 ฝั่ง) */}
      <div className={`grid grid-cols-2 ${compact ? 'gap-x-8 gap-y-3 mt-3' : 'gap-x-16 gap-y-5 mt-6'} ${compact ? 'text-[9px]' : 'text-xs'} text-center`}>
        {[FL.senderWash, FL.receiverWashed, FL.receiverWash, FL.senderWashed].map((sig, i) => (
          <div key={i}>
            <div className={`border-b border-slate-400 ${compact ? 'pb-3' : 'pb-6'} mb-1`}></div>
            <Tri label={sig} langs={langs} center />
            {(i === 1 || i === 3) && <span className="text-slate-400">(FlowClean)</span>}
          </div>
        ))}
      </div>

      {!compact && (
        <div className="mt-6 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
          <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
        </div>
      )}
    </div>
  )
}
