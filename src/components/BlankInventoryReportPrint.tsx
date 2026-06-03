'use client'

// 376.6 — Inventory Report เปล่า (Form Designer archetype 3 — AKARA แนวนอน)
//   ต่างจาก LF/CK: column set = inventory 2-ฝั่ง (ส่งซักนอก breakdown → รวม → กลับมา → รวม → ค้าง/ดิน → remark)
//   · อังกฤษนำ (ตามฟอร์ม AKARA จริง) · ไม่มีกล่องนับถุง / ไม่มีลายเซ็น (ต่างจาก LF)
//   · ฟอร์มเปล่าเขียนมือ — ไม่มี calc (spot/ดิน = หัวคอลัมน์ลอกจากรูปเป๊ะ ติ๊ดเขียนมือเอง)
//   · reuse โครง BlankLinenFormPrint: fit-to-page (rowHeightPx/fontPx) · code badge · กล่องชื่อ/วันที่

import { formatDate, cn } from '@/lib/utils'
import { FL, type FormLang, type TriLabel } from '@/lib/form-i18n'
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
  langs?: FormLang[]
  rowHeightPx: number
  fontPx: number
  extraRows?: number
}

// column widths (รวม 100%) · washOutside กว้างสุด (breakdown "131+18+12+") · 2 ช่อง TOTAL
const COL_W = { no: '3%', item: '22%' }
const DATA_COLS: { key: string; label: TriLabel; w: string }[] = [
  { key: 'wash',   label: FL.washOutside, w: '15%' },  // ส่งซักข้างนอก (breakdown)
  { key: 'tot1',   label: FL.total,       w: '9%' },   // รวมฝั่งส่ง
  { key: 'come',   label: FL.laundryCome, w: '12%' },  // ผ้ากลับมา
  { key: 'tot2',   label: FL.total,       w: '9%' },   // รวมฝั่งกลับ
  { key: 'spendg', label: FL.spotPending, w: '10%' },  // ผ้าสปอตค้าง
  { key: 'sdirt',  label: FL.spotDirt,    w: '11%' },  // ยอดดินผ้าสปอต
  { key: 'remark', label: FL.remark,      w: '9%' },
]

// 376.6 — อังกฤษนำ (ตาม AKARA) · bold บรรทัดแรก "ที่มีจริง" (กัน label ที่ en='' โชว์ TH แบบจาง)
function TriInv({ label, langs, center }: { label: TriLabel; langs: FormLang[]; center?: boolean }) {
  const order = langs.includes('en')
    ? (['en', 'th', 'my'] as FormLang[]).filter(l => langs.includes(l))
    : langs
  const lines = order.map(l => label[l]).filter(Boolean)
  return (
    <span className={cn('block leading-tight', center && 'text-center')}>
      {lines.map((txt, i) => (
        <span key={i} className={cn('block leading-tight', i === 0 ? 'font-semibold' : 'opacity-70')}
          style={i > 0 ? { fontSize: '0.82em' } : undefined}>{txt}</span>
      ))}
    </span>
  )
}

export default function BlankInventoryReportPrint({
  customer, company, items, date,
  showCustomer = true, showDate = true, sheetTitle, compact = false, id = 'print-blank-inv',
  langs = ['th', 'en'], rowHeightPx, fontPx, extraRows = 0,
}: Props) {
  const pad = compact ? 'p-3' : 'p-8'
  const coTitle = compact ? 'text-sm' : 'text-xl'
  // อังกฤษนำสำหรับ item name (ตาม AKARA: "Bed sheet K. 116*122") — bold บรรทัดแรกที่มีจริง
  const itemOrder = langs.includes('en') ? (['en', 'th'] as const).filter(l => langs.includes(l)) : (['th'] as const)
  let rowNo = 0

  return (
    <div className={`bg-white ${pad} mx-auto print:shadow-none print:px-2 print:py-0 w-full`} id={id}>
      {/* Title */}
      <div className={`flex justify-between items-start border-b-2 border-[#1B3A5C] ${compact ? 'mb-2 pb-1' : 'mb-4 pb-3'}`}>
        <div>
          <h1 className={`${coTitle} font-bold text-[#1B3A5C]`}>{company.name}</h1>
          {!compact && <p className="text-xs text-slate-500">{company.nameEn}</p>}
          <p className={compact ? 'text-[9px] text-slate-500' : 'text-xs text-slate-500'}>โทร: {company.phone}</p>
        </div>
        <div className="text-right">
          <TriInv label={FL.docTitleInv} langs={langs} />
          {sheetTitle && <p className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-slate-600`}>📋 {sheetTitle}</p>}
        </div>
      </div>

      {/* Provenance: ชื่อลูกค้า + วันที่ (ไม่มีกล่องนับถุง — ต่างจาก LF) */}
      <div className={`flex items-stretch gap-1.5 ${compact ? 'mb-2' : 'mb-3'}`}>
        <div className="border-2 border-[#1B3A5C] rounded-lg w-[36%] px-2 py-0.5 text-[10px]">
          <TriInv label={FL.customer} langs={langs} />
          {showCustomer && customer ? (
            <p className="font-bold text-slate-900 leading-tight truncate text-sm">{customer.shortName || customer.name}</p>
          ) : (
            <div className="border-b-2 border-dotted border-slate-400 h-4"></div>
          )}
        </div>
        <div className="border-2 border-[#1B3A5C] rounded-lg w-[26%] px-2 py-0.5 text-[10px]">
          <TriInv label={FL.date} langs={langs} />
          {showDate ? (
            <p className="font-bold text-slate-900 leading-tight text-sm">{formatDate(date)}</p>
          ) : (
            <div className="border-b-2 border-dotted border-slate-400 h-4"></div>
          )}
        </div>
      </div>

      {/* Items Table — 9 cols · อังกฤษนำ · thead ซ้ำตอน paginate (browser) */}
      <table className={`blank-form-table w-full border-2 border-slate-600 ${compact ? 'mb-2' : 'mb-4'}`} style={{ fontSize: `${fontPx}px`, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: COL_W.no }} />
          <col style={{ width: COL_W.item }} />
          {DATA_COLS.map(c => <col key={c.key} style={{ width: c.w }} />)}
        </colgroup>
        <thead>
          <tr className="text-[#1B3A5C] align-bottom leading-none">
            <th className="text-center px-0.5 py-0.5 border border-slate-500"><TriInv label={FL.no} langs={langs} center /></th>
            <th className="text-left px-1 py-0.5 border border-slate-500"><TriInv label={FL.item} langs={langs} /></th>
            {DATA_COLS.map(c => (
              <th key={c.key} className="text-center px-0.5 py-0.5 border border-slate-500">
                <TriInv label={c.label} langs={langs} center />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            rowNo++
            const lines = itemOrder.map(l => (l === 'en' ? item.nameEn : item.name)).filter(Boolean)
            return (
              <tr key={item.code}>
                <td className="text-center px-0.5 py-0.5 border border-slate-500 text-slate-400" style={{ height: `${rowHeightPx}px` }}>{rowNo}</td>
                <td className="px-1 py-0.5 border border-slate-500">
                  <div className="flex items-start justify-between gap-1">
                    <span className="min-w-0 leading-tight">
                      {(lines.length ? lines : [item.name]).map((txt, i) => (
                        <span key={i} className={cn('block leading-tight', i === 0 ? 'font-medium' : 'opacity-60')}
                          style={i > 0 ? { fontSize: '0.82em' } : undefined}>{txt}</span>
                      ))}
                    </span>
                    <span className="flex-shrink-0 font-mono font-bold border border-slate-400 rounded px-1 leading-tight">{item.code}</span>
                  </div>
                </td>
                {DATA_COLS.map(c => <td key={c.key} className="border border-slate-500"></td>)}
              </tr>
            )
          })}
          {/* แถวว่าง ad-hoc */}
          {Array.from({ length: Math.max(0, extraRows) }).map((_, i) => {
            rowNo++
            return (
              <tr key={`blank-${i}`}>
                <td className="text-center px-0.5 py-0.5 border border-slate-500 text-slate-300" style={{ height: `${rowHeightPx}px` }}>{rowNo}</td>
                <td className="border border-slate-500"></td>
                {DATA_COLS.map(c => <td key={c.key} className="border border-slate-500"></td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
