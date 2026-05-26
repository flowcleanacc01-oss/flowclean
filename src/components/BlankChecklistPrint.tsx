'use client'

// 376 — ใบเช็คผ้าเปล่า v3 (Form Designer v3)
//  · คอลัมน์: # / รายการ(+code) / นับส่ง(แดง) / ต่อถุง-แพคส่ง(น้ำเงิน) / รวม
//  · 376.4 3 ภาษา (ไทย/อังกฤษ/พม่า) · 376.5 จัดกลุ่ม+เส้นหนา · 376.1 density · 376.3 แถวว่าง
//  · scan-friendly: code เด่นทุกแถว + สีปากกา (แดง/น้ำเงิน) ช่วย AI สแกนแม่น

import { Fragment } from 'react'
import { formatDate, cn } from '@/lib/utils'
import { FL, DENSITY, BURMESE_ITEM, type FormLang, type FormDensity, type TriLabel } from '@/lib/form-i18n'
import type { Customer, CompanyInfo, LinenItemDef, LinenCategoryDef } from '@/types'

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
  density?: FormDensity
  extraRows?: number
  grouped?: boolean
  categories?: LinenCategoryDef[]
}

const COL_W = { no: '5%', item: '40%', send: '18%', pack: '25%', total: '12%' }

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

export default function BlankChecklistPrint({
  customer, company, items, date,
  showCustomer = true, showDate = true, sheetTitle, compact = false, id = 'print-blank-checklist',
  langs = ['th', 'en', 'my'], density = 'normal', extraRows = 0, grouped = false, categories = [],
}: BlankChecklistPrintProps) {
  const pad = compact ? 'p-3' : 'p-8'
  const coTitle = compact ? 'text-sm' : 'text-xl'
  const provVal = compact ? 'text-base' : 'text-2xl'
  const d = DENSITY[density]

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

  let rowNo = 0
  const colCount = 5

  return (
    // 376: print:px-2 print:py-0 — คืน padding ที่ซ้ำกับ @page margin (กันล้นหน้า 2)
    <div className={`bg-white ${pad} mx-auto print:shadow-none print:px-2 print:py-0 w-full`} id={id} style={{ fontSize: `${d.fontPx}px` }}>
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

      {/* Provenance: ชื่อลูกค้า + วันที่ + จำนวนถุง */}
      <div className={`flex justify-between items-stretch gap-2 ${compact ? 'mb-2' : 'mb-4'}`}>
        <div className="flex gap-2 flex-1">
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
        <div className={`border-2 border-[#1B3A5C] rounded-lg ${compact ? 'px-2 py-1' : 'px-5 py-2'} text-center`}>
          <Tri label={FL.bagCount} langs={langs} center />
          <div className={`${compact ? 'w-12 h-5' : 'w-20 h-9'} border-b-2 border-dotted border-slate-400 mx-auto`}></div>
        </div>
      </div>

      {/* Items Table */}
      <table className="blank-form-table w-full border-2 border-slate-600 mb-1" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: COL_W.no }} />
          <col style={{ width: COL_W.item }} />
          <col style={{ width: COL_W.send }} />
          <col style={{ width: COL_W.pack }} />
          <col style={{ width: COL_W.total }} />
        </colgroup>
        <thead>
          <tr className="align-bottom">
            <th className={`text-center px-0.5 ${compact ? 'py-1' : 'py-2'} border border-slate-500`}><Tri label={FL.no} langs={langs} center /></th>
            <th className={`text-left px-1 ${compact ? 'py-1' : 'py-2'} border border-slate-500`}><Tri label={FL.item} langs={langs} /></th>
            <th className={`text-center px-0.5 ${compact ? 'py-1' : 'py-2'} border border-slate-500`}>
              <Tri label={FL.ckCountSend} langs={langs} center />
              <span className="block text-red-600 text-[0.8em]">{compact ? '(แดง)' : '(สีแดง)'}</span>
            </th>
            <th className={`text-center px-0.5 ${compact ? 'py-1' : 'py-2'} border border-slate-500`}>
              <Tri label={FL.ckPerBagPack} langs={langs} center />
              <span className="block text-blue-600 text-[0.8em]">{compact ? '(น้ำเงิน · คั่น +)' : '(สีน้ำเงิน · หลายถุงคั่น + เช่น 43+36)'}</span>
            </th>
            <th className={`text-center px-0.5 ${compact ? 'py-1' : 'py-2'} border border-slate-500`}><Tri label={FL.total} langs={langs} center /></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <Fragment key={gi}>
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
                    <td className={`px-1 ${d.cellPy} border border-slate-500`}></td>
                    <td className={`px-1 ${d.cellPy} border border-slate-500`}><div className={compact ? 'min-h-[16px]' : 'min-h-[30px]'}></div></td>
                    <td className={`px-1 ${d.cellPy} border border-slate-500`}></td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
          {Array.from({ length: Math.max(0, extraRows) }).map((_, i) => {
            rowNo++
            return (
              <tr key={`blank-${i}`}>
                <td className={`text-center px-0.5 ${d.cellPy} border border-slate-500 text-slate-300`}>{rowNo}</td>
                <td className={`border border-slate-500 ${d.cellPy}`}></td>
                <td className={`border border-slate-500 ${d.cellPy}`}></td>
                <td className={`border border-slate-500 ${d.cellPy}`}></td>
                <td className={`border border-slate-500 ${d.cellPy}`}></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className={`${compact ? 'text-[8px]' : 'text-[10px]'} text-slate-400 ${compact ? 'mb-2' : 'mb-4'}`}>
        💡 <span className="text-red-600 font-medium">นับส่ง = ปากกาแดง</span> · <span className="text-blue-600 font-medium">ต่อถุง = ปากกาน้ำเงิน</span> — ช่วยให้สแกนแม่นขึ้น
      </p>

      {/* Signatures */}
      <div className={`grid grid-cols-2 ${compact ? 'gap-6 mt-3' : 'gap-16 mt-8'} ${compact ? 'text-[9px]' : 'text-xs'} text-center`}>
        <div>
          <div className={`border-b border-slate-400 ${compact ? 'pb-4' : 'pb-8'} mb-1`}></div>
          <Tri label={FL.senderWash} langs={langs} center />
        </div>
        <div>
          <div className={`border-b border-slate-400 ${compact ? 'pb-4' : 'pb-8'} mb-1`}></div>
          <Tri label={FL.receiverWash} langs={langs} center />
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
