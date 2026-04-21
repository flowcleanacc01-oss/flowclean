'use client'

import type {
  LinenForm, Customer, CompanyInfo, LinenItemDef,
  CarryOverAdjustment, CarryOverMode,
} from '@/types'
import { CARRY_OVER_MODE_CONFIG } from '@/types'
import { formatDate, cn } from '@/lib/utils'

interface Props {
  customer: Customer
  company: CompanyInfo
  catalog: LinenItemDef[]
  linenForms: LinenForm[]
  carryOverAdjustments: CarryOverAdjustment[]
  startDate: string
  endDate: string
  mode: CarryOverMode | 'compare'
  view: 'monthly' | 'yearly'
  showAdjustments: boolean
  getCarryOver: (customerId: string, beforeDate: string, mode?: CarryOverMode, includeHidden?: boolean) => Record<string, number>
}

export default function CarryOverReportPrint(props: Props) {
  const {
    customer, company, catalog, linenForms, carryOverAdjustments,
    startDate, endDate, mode, view, showAdjustments, getCarryOver,
  } = props

  // ---- Helpers ----
  const nextDay = (iso: string): string => {
    const d = new Date(iso)
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }
  const fmt = (n: number) => n > 0 ? `+${n}` : `${n}`
  const colorOf = (n: number) => n < 0 ? 'text-red-700' : n > 0 ? 'text-emerald-700' : 'text-slate-400'

  // ---- Active codes (รายการที่มีกิจกรรมในช่วงเวลานี้) ----
  const codesSet = new Set<string>()
  for (const f of linenForms) {
    if (f.customerId !== customer.id) continue
    if (f.date < startDate || f.date > endDate) continue
    for (const r of f.rows) codesSet.add(r.code)
  }
  for (const a of carryOverAdjustments) {
    if (a.isDeleted || a.customerId !== customer.id) continue
    if (a.date < startDate || a.date > endDate) continue
    for (const it of a.items) codesSet.add(it.code)
  }
  // Also include codes ที่มี brought-forward balance (ยกมา) ไม่ว่าจะมี LF ในช่วงนี้หรือไม่
  if (mode !== 'compare') {
    const bf = getCarryOver(customer.id, startDate, mode, showAdjustments)
    for (const code of Object.keys(bf)) {
      if (bf[code] !== 0) codesSet.add(code)
    }
  }
  const orderMap = new Map(catalog.map((it, i) => [it.code, i]))
  const activeCodes = [...codesSet].sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999))
  const itemNameMap = Object.fromEntries(catalog.map(it => [it.code, it.name]))

  // ---- Days/Months in range ----
  const days: string[] = []
  if (view === 'monthly' && mode !== 'compare') {
    const cur = new Date(startDate)
    const end = new Date(endDate)
    while (cur <= end) {
      days.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
  }
  const months: string[] = []
  if (view === 'yearly' && mode !== 'compare') {
    const start = new Date(startDate)
    const end = new Date(endDate)
    let y = start.getFullYear()
    let m = start.getMonth()
    while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
      months.push(`${y}-${String(m + 1).padStart(2, '0')}`)
      m++
      if (m > 11) { m = 0; y++ }
    }
  }

  // ---- Compute helpers ----
  const computeDailyDiff = (code: string, day: string, m: CarryOverMode): number => {
    let diff = 0
    for (const f of linenForms) {
      if (f.customerId !== customer.id || f.date !== day) continue
      for (const r of f.rows) {
        if (r.code !== code) continue
        switch (m) {
          case 1: diff += (r.col6_factoryPackSend || 0) - r.col5_factoryClaimApproved; break
          case 2: diff += (r.col6_factoryPackSend || 0) - r.col2_hotelCountIn; break
          case 3: diff += r.col4_factoryApproved - r.col5_factoryClaimApproved; break
          case 4: diff += r.col4_factoryApproved - r.col2_hotelCountIn; break
        }
      }
    }
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== customer.id || a.date !== day || a.type !== 'adjust') continue
      if (!showAdjustments && !a.showInCustomerReport) continue
      for (const it of a.items) {
        if (it.code === code) diff += it.delta || 0
      }
    }
    return diff
  }

  const computeMonthlySum = (code: string, monthYM: string, m: CarryOverMode): number => {
    let sum = 0
    for (const f of linenForms) {
      if (f.customerId !== customer.id || !f.date.startsWith(monthYM)) continue
      for (const r of f.rows) {
        if (r.code !== code) continue
        switch (m) {
          case 1: sum += (r.col6_factoryPackSend || 0) - r.col5_factoryClaimApproved; break
          case 2: sum += (r.col6_factoryPackSend || 0) - r.col2_hotelCountIn; break
          case 3: sum += r.col4_factoryApproved - r.col5_factoryClaimApproved; break
          case 4: sum += r.col4_factoryApproved - r.col2_hotelCountIn; break
        }
      }
    }
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== customer.id || !a.date.startsWith(monthYM) || a.type !== 'adjust') continue
      if (!showAdjustments && !a.showInCustomerReport) continue
      for (const it of a.items) {
        if (it.code === code) sum += it.delta || 0
      }
    }
    return sum
  }

  // ---- Brought / Carried ----
  const brought = mode === 'compare' ? {} : getCarryOver(customer.id, startDate, mode, showAdjustments)
  const carried = mode === 'compare' ? {} : getCarryOver(customer.id, nextDay(endDate), mode, showAdjustments)

  // ---- Compare values (4 modes) ----
  const compareValues = mode === 'compare' ? {
    1: getCarryOver(customer.id, nextDay(endDate), 1, showAdjustments),
    2: getCarryOver(customer.id, nextDay(endDate), 2, showAdjustments),
    3: getCarryOver(customer.id, nextDay(endDate), 3, showAdjustments),
    4: getCarryOver(customer.id, nextDay(endDate), 4, showAdjustments),
  } as Record<CarryOverMode, Record<string, number>> : null

  // ---- Adjustments in range ----
  const adjInRange = carryOverAdjustments
    .filter(a =>
      !a.isDeleted &&
      a.customerId === customer.id &&
      a.date >= startDate &&
      a.date <= endDate &&
      (showAdjustments || a.showInCustomerReport)
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  // ---- Title ----
  const titleByMode = mode === 'compare'
    ? 'เปรียบเทียบทุกเคส (1-4)'
    : `เคส ${mode}: ${CARRY_OVER_MODE_CONFIG[mode].label} (${CARRY_OVER_MODE_CONFIG[mode].description})`
  const modeHint = mode !== 'compare' ? CARRY_OVER_MODE_CONFIG[mode].hint : undefined
  const titleByView = view === 'monthly' ? 'แจกแจงรายวัน' : 'แจกแจงรายเดือน'

  return (
    <div className="bg-white p-4 mx-auto text-xs print:p-0 print:shadow-none" id="print-carryover-report"
      style={{ maxWidth: '297mm' }}>
      {/* Header */}
      <div className="text-center mb-4 border-b border-[#1B3A5C] pb-3">
        <h1 className="text-base font-bold text-[#1B3A5C]">{company.name}</h1>
        <h2 className="text-sm font-bold text-[#1B3A5C] mt-1">รายงานผ้าค้าง/คืน</h2>
        <p className="text-[10px] text-slate-600 mt-1">{titleByMode}</p>
        {modeHint && <p className="text-[10px] text-slate-500 mt-0.5 italic">({modeHint})</p>}
        <p className="text-[10px] text-slate-500 mt-1">
          ลูกค้า: <strong>{customer.name}</strong>
          {' | '}ช่วงเวลา: <strong>{formatDate(startDate)}</strong> ถึง <strong>{formatDate(endDate)}</strong>
          {mode !== 'compare' && <> {' | '}รูปแบบ: <strong>{titleByView}</strong></>}
        </p>
      </div>

      {/* Compare Mode Table */}
      {mode === 'compare' && compareValues && (
        <table className="w-full text-[11px] border-collapse border border-slate-400">
          <thead>
            <tr className="bg-[#e8eef5]">
              <th className="border border-slate-400 px-2 py-2 text-left w-14">รหัส</th>
              <th className="border border-slate-400 px-2 py-2 text-left">รายการ</th>
              <th className="border border-slate-400 px-2 py-2 text-right w-28">
                เคส 1<br />
                <span className="text-[8.5px] font-normal text-slate-500 leading-tight block">{CARRY_OVER_MODE_CONFIG[1].label}</span>
                <span className="text-[8px] font-normal text-slate-400 italic leading-tight block">({CARRY_OVER_MODE_CONFIG[1].description})</span>
              </th>
              <th className="border border-slate-400 px-2 py-2 text-right w-28">
                เคส 2<br />
                <span className="text-[8.5px] font-normal text-slate-500 leading-tight block">{CARRY_OVER_MODE_CONFIG[2].label}</span>
                <span className="text-[8px] font-normal text-slate-400 italic leading-tight block">({CARRY_OVER_MODE_CONFIG[2].description})</span>
              </th>
              <th className="border border-slate-400 px-2 py-2 text-right w-28">
                เคส 3<br />
                <span className="text-[8.5px] font-normal text-slate-500 leading-tight block">{CARRY_OVER_MODE_CONFIG[3].label}</span>
                <span className="text-[8px] font-normal text-slate-400 italic leading-tight block">({CARRY_OVER_MODE_CONFIG[3].description})</span>
              </th>
              <th className="border border-slate-400 px-2 py-2 text-right w-28">
                เคส 4<br />
                <span className="text-[8.5px] font-normal text-slate-500 leading-tight block">{CARRY_OVER_MODE_CONFIG[4].label}</span>
                <span className="text-[8px] font-normal text-slate-400 italic leading-tight block">({CARRY_OVER_MODE_CONFIG[4].description})</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {activeCodes.length === 0 ? (
              <tr><td colSpan={6} className="border border-slate-400 px-4 py-8 text-center text-slate-400">ไม่มีรายการในช่วงเวลานี้</td></tr>
            ) : activeCodes.map(code => {
              const v1 = compareValues[1][code] || 0
              const v2 = compareValues[2][code] || 0
              const v3 = compareValues[3][code] || 0
              const v4 = compareValues[4][code] || 0
              return (
                <tr key={code}>
                  <td className="border border-slate-400 px-2 py-1.5 font-mono text-slate-500">{code}</td>
                  <td className="border border-slate-400 px-2 py-1.5">{itemNameMap[code]}</td>
                  <td className={cn('border border-slate-400 px-2 py-1.5 text-right font-mono', colorOf(v1))}>{fmt(v1)}</td>
                  <td className={cn('border border-slate-400 px-2 py-1.5 text-right font-mono', colorOf(v2))}>{fmt(v2)}</td>
                  <td className={cn('border border-slate-400 px-2 py-1.5 text-right font-mono', colorOf(v3))}>{fmt(v3)}</td>
                  <td className={cn('border border-slate-400 px-2 py-1.5 text-right font-mono', colorOf(v4))}>{fmt(v4)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Monthly View — รายการ=row, day=col */}
      {mode !== 'compare' && view === 'monthly' && (
        <table className="w-full text-[10px] border-collapse border border-slate-400">
          <thead>
            <tr className="bg-[#e8eef5]">
              <th className="border border-slate-400 px-1 py-1 text-left w-12">รหัส</th>
              <th className="border border-slate-400 px-1 py-1 text-left min-w-20">รายการ</th>
              <th className="border border-slate-400 px-1 py-1 text-right w-12 bg-amber-50">ยกมา</th>
              {days.map(day => (
                <th key={day} className="border border-slate-400 px-0.5 py-1 text-right w-7">{parseInt(day.split('-')[2])}</th>
              ))}
              <th className="border border-slate-400 px-1 py-1 text-right w-12 bg-blue-50">รวม</th>
              <th className="border border-slate-400 px-1 py-1 text-right w-12 bg-indigo-50">สะสม</th>
            </tr>
          </thead>
          <tbody>
            {activeCodes.length === 0 ? (
              <tr><td colSpan={days.length + 5} className="border border-slate-400 px-4 py-8 text-center text-slate-400">ไม่มีรายการในช่วงเวลานี้</td></tr>
            ) : activeCodes.map(code => {
              const b = brought[code] || 0
              const c = carried[code] || 0
              const monthTotal = c - b
              return (
                <tr key={code}>
                  <td className="border border-slate-400 px-1 py-1 font-mono text-slate-500">{code}</td>
                  <td className="border border-slate-400 px-1 py-1">{itemNameMap[code]}</td>
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono', colorOf(b))}>{fmt(b)}</td>
                  {days.map(day => {
                    const d = computeDailyDiff(code, day, mode)
                    return (
                      <td key={day} className={cn('border border-slate-400 px-0.5 py-1 text-right font-mono', d === 0 ? 'text-slate-300' : colorOf(d))}>
                        {d === 0 ? '·' : (d > 0 ? '+' : '') + d}
                      </td>
                    )
                  })}
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono bg-blue-50', colorOf(monthTotal))}>{fmt(monthTotal)}</td>
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono bg-indigo-50 font-semibold', colorOf(c))}>{fmt(c)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Yearly View — รายการ=row, month=col */}
      {mode !== 'compare' && view === 'yearly' && (
        <table className="w-full text-[10px] border-collapse border border-slate-400">
          <thead>
            <tr className="bg-[#e8eef5]">
              <th className="border border-slate-400 px-1 py-1 text-left w-12">รหัส</th>
              <th className="border border-slate-400 px-1 py-1 text-left min-w-24">รายการ</th>
              <th className="border border-slate-400 px-1 py-1 text-right w-14 bg-amber-50">ยกมา</th>
              {months.map(monthYM => (
                <th key={monthYM} className="border border-slate-400 px-1 py-1 text-right w-12">{monthYM.slice(5)}/{monthYM.slice(2, 4)}</th>
              ))}
              <th className="border border-slate-400 px-1 py-1 text-right w-14 bg-blue-50">รวม</th>
              <th className="border border-slate-400 px-1 py-1 text-right w-14 bg-indigo-50">สะสม</th>
            </tr>
          </thead>
          <tbody>
            {activeCodes.length === 0 ? (
              <tr><td colSpan={months.length + 5} className="border border-slate-400 px-4 py-8 text-center text-slate-400">ไม่มีรายการในช่วงเวลานี้</td></tr>
            ) : activeCodes.map(code => {
              const b = brought[code] || 0
              const c = carried[code] || 0
              const yearTotal = c - b
              return (
                <tr key={code}>
                  <td className="border border-slate-400 px-1 py-1 font-mono text-slate-500">{code}</td>
                  <td className="border border-slate-400 px-1 py-1">{itemNameMap[code]}</td>
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono', colorOf(b))}>{fmt(b)}</td>
                  {months.map(monthYM => {
                    const sum = computeMonthlySum(code, monthYM, mode)
                    return (
                      <td key={monthYM} className={cn('border border-slate-400 px-1 py-1 text-right font-mono', sum === 0 ? 'text-slate-300' : colorOf(sum))}>
                        {sum === 0 ? '·' : (sum > 0 ? '+' : '') + sum}
                      </td>
                    )
                  })}
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono bg-blue-50', colorOf(yearTotal))}>{fmt(yearTotal)}</td>
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono bg-indigo-50 font-semibold', colorOf(c))}>{fmt(c)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Adjustments History */}
      {showAdjustments && adjInRange.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[11px] font-bold text-slate-700 mb-2">รายการปรับยอดในช่วงเวลานี้ ({adjInRange.length})</h3>
          <table className="w-full text-[10px] border-collapse border border-slate-400">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-400 px-2 py-1 text-left w-20">วันที่</th>
                <th className="border border-slate-400 px-2 py-1 text-left w-16">ประเภท</th>
                <th className="border border-slate-400 px-2 py-1 text-left">รายการ</th>
                <th className="border border-slate-400 px-2 py-1 text-left">เหตุผล</th>
              </tr>
            </thead>
            <tbody>
              {adjInRange.map(a => (
                <tr key={a.id}>
                  <td className="border border-slate-400 px-2 py-1 font-mono">{formatDate(a.date)}</td>
                  <td className="border border-slate-400 px-2 py-1">
                    <span className={cn('inline-block px-1.5 py-0.5 rounded font-medium',
                      a.type === 'reset' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800')}>
                      {a.type === 'reset' ? 'Reset' : 'Adjust'}
                    </span>
                  </td>
                  <td className="border border-slate-400 px-2 py-1 font-mono">
                    {a.items.map(it => `${it.code}${a.type === 'adjust' && it.delta !== 0 ? ` ${it.delta > 0 ? '+' : ''}${it.delta}` : ''}`).join(', ')}
                  </td>
                  <td className="border border-slate-400 px-2 py-1 text-slate-700">{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400">
        <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
      </div>
    </div>
  )
}
