'use client'

import { useMemo } from 'react'
import type {
  LinenForm, Customer, CompanyInfo, LinenItemDef,
  CarryOverAdjustment, CarryOverMode,
} from '@/types'
import { CARRY_OVER_MODE_CONFIG } from '@/types'
import { formatDate, cn } from '@/lib/utils'
import { getGroupAnchorCode } from '@/lib/aggregate-groups'

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

  // 353: aggregate group meta — per code (pattern เดียวกับ reports/page.tsx post-349)
  const aggGroupInfo = useMemo(() => {
    type Meta = { groupKey: string; anchorCode: string; isAnchor: boolean }
    const meta = new Map<string, Meta>()
    if (!customer.aggregateSizeGroups || customer.aggregateSizeGroups.length === 0) return meta
    for (const cfg of customer.aggregateSizeGroups) {
      const col5Agg = (cfg.col5Mode ?? 'aggregate') === 'aggregate'
      const col2Agg = cfg.col2Mode === 'aggregate'
      if (!col5Agg && !col2Agg) continue
      const groupItems = catalog.filter(i => i.sizeGroup === cfg.groupKey)
      if (groupItems.length === 0) continue
      const anchorCode = getGroupAnchorCode(groupItems, cfg.anchorCode)
      for (const item of groupItems) {
        meta.set(item.code, { groupKey: cfg.groupKey, anchorCode, isAnchor: item.code === anchorCode })
      }
    }
    return meta
  }, [customer.aggregateSizeGroups, catalog])

  // ---- Active codes — group cohesion + expand group members ----
  const orderedCodes = useMemo(() => {
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
    // include brought-forward codes
    if (mode !== 'compare') {
      const bf = getCarryOver(customer.id, startDate, mode, showAdjustments)
      for (const code of Object.keys(bf)) {
        if (bf[code] !== 0) codesSet.add(code)
      }
    }
    // 353: expand to full group members + sort with group cohesion
    const expanded = new Set<string>(codesSet)
    for (const c of codesSet) {
      const m = aggGroupInfo.get(c)
      if (!m) continue
      const groupItems = catalog.filter(i => i.sizeGroup === m.groupKey)
      for (const gi of groupItems) expanded.add(gi.code)
    }
    const orderMap = new Map(catalog.map((it, i) => [it.code, i]))
    const baseSorted = [...expanded].sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999))
    const result: string[] = []
    const seen = new Set<string>()
    for (const code of baseSorted) {
      if (seen.has(code)) continue
      const m = aggGroupInfo.get(code)
      if (m) {
        const groupCodes = catalog
          .filter(i => i.sizeGroup === m.groupKey && expanded.has(i.code))
          .map(i => i.code)
          .sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999))
        for (const gc of groupCodes) {
          if (!seen.has(gc)) { result.push(gc); seen.add(gc) }
        }
      } else {
        result.push(code); seen.add(code)
      }
    }
    return result
  }, [linenForms, carryOverAdjustments, customer.id, startDate, endDate, mode, showAdjustments, getCarryOver, aggGroupInfo, catalog])

  // 353: per-code metadata for visual brace + cell arrow
  const rowMeta = useMemo(() => {
    type RowMeta = {
      isInGroup: boolean
      isAnchor: boolean
      anchorCode: string
      anchorIndex: number
      indexInList: number
      isFirstInGroup: boolean
      isLastInGroup: boolean
    }
    const map = new Map<string, RowMeta>()
    // หา anchor index per group
    const groupAnchors = new Map<string, number>()
    orderedCodes.forEach((code, idx) => {
      const info = aggGroupInfo.get(code)
      if (info && info.isAnchor) groupAnchors.set(info.groupKey, idx)
    })
    const groupRange = new Map<string, { first: number; last: number }>()
    orderedCodes.forEach((code, idx) => {
      const info = aggGroupInfo.get(code)
      if (!info) return
      const existing = groupRange.get(info.groupKey)
      if (!existing) groupRange.set(info.groupKey, { first: idx, last: idx })
      else existing.last = idx
    })
    orderedCodes.forEach((code, idx) => {
      const info = aggGroupInfo.get(code)
      if (!info) {
        map.set(code, {
          isInGroup: false, isAnchor: false, anchorCode: code, anchorIndex: idx,
          indexInList: idx, isFirstInGroup: false, isLastInGroup: false,
        })
        return
      }
      const range = groupRange.get(info.groupKey)
      map.set(code, {
        isInGroup: true,
        isAnchor: info.isAnchor,
        anchorCode: info.anchorCode,
        anchorIndex: groupAnchors.get(info.groupKey) ?? idx,
        indexInList: idx,
        isFirstInGroup: range ? idx === range.first : false,
        isLastInGroup: range ? idx === range.last : false,
      })
    })
    return map
  }, [orderedCodes, aggGroupInfo])

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

  // ---- Daily/Monthly diff — group-aware ----
  /** Anchor row: sum diff ทุก code ใน group · ungrouped: per-row */
  const computeDailyDiff = (code: string, day: string, mo: CarryOverMode): number => {
    const info = aggGroupInfo.get(code)
    const groupCodes = info?.isAnchor
      ? new Set(catalog.filter(i => i.sizeGroup === info.groupKey).map(i => i.code))
      : null
    let diff = 0
    for (const f of linenForms) {
      if (f.customerId !== customer.id || f.date !== day) continue
      const em: CarryOverMode = f.workflowMode === 'trust_customer' ? 2 : mo
      for (const r of f.rows) {
        const matches = groupCodes ? groupCodes.has(r.code) : r.code === code
        if (!matches) continue
        switch (em) {
          case 1: diff += (r.col6_factoryPackSend || 0) - r.col5_factoryClaimApproved; break
          case 2: diff += (r.col6_factoryPackSend || 0) - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
          case 3: diff += r.col4_factoryApproved - r.col5_factoryClaimApproved; break
          case 4: diff += r.col4_factoryApproved - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
        }
      }
    }
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== customer.id || a.date !== day || a.type !== 'adjust') continue
      if (!showAdjustments && !a.showInCustomerReport) continue
      for (const it of a.items) {
        const matches = groupCodes ? groupCodes.has(it.code) : it.code === code
        if (matches) diff += it.delta || 0
      }
    }
    return diff
  }

  /** Non-anchor daily — adj only (LF aggregate ที่ anchor แล้ว) */
  const computeNonAnchorDailyAdj = (code: string, day: string): number => {
    let d = 0
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== customer.id || a.date !== day || a.type !== 'adjust') continue
      if (!showAdjustments && !a.showInCustomerReport) continue
      for (const it of a.items) if (it.code === code) d += it.delta || 0
    }
    return d
  }

  const computeMonthlySum = (code: string, monthYM: string, mo: CarryOverMode): number => {
    const info = aggGroupInfo.get(code)
    const groupCodes = info?.isAnchor
      ? new Set(catalog.filter(i => i.sizeGroup === info.groupKey).map(i => i.code))
      : null
    let sum = 0
    for (const f of linenForms) {
      if (f.customerId !== customer.id || !f.date.startsWith(monthYM)) continue
      const em: CarryOverMode = f.workflowMode === 'trust_customer' ? 2 : mo
      for (const r of f.rows) {
        const matches = groupCodes ? groupCodes.has(r.code) : r.code === code
        if (!matches) continue
        switch (em) {
          case 1: sum += (r.col6_factoryPackSend || 0) - r.col5_factoryClaimApproved; break
          case 2: sum += (r.col6_factoryPackSend || 0) - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
          case 3: sum += r.col4_factoryApproved - r.col5_factoryClaimApproved; break
          case 4: sum += r.col4_factoryApproved - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
        }
      }
    }
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== customer.id || !a.date.startsWith(monthYM) || a.type !== 'adjust') continue
      if (!showAdjustments && !a.showInCustomerReport) continue
      for (const it of a.items) {
        const matches = groupCodes ? groupCodes.has(it.code) : it.code === code
        if (matches) sum += it.delta || 0
      }
    }
    return sum
  }

  const computeNonAnchorMonthlyAdj = (code: string, monthYM: string): number => {
    let s = 0
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== customer.id || !a.date.startsWith(monthYM) || a.type !== 'adjust') continue
      if (!showAdjustments && !a.showInCustomerReport) continue
      for (const it of a.items) if (it.code === code) s += it.delta || 0
    }
    return s
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

  // 353: cell arrow helper — ↓/↑ for first/last row of group when anchor has value
  const cellArrow = (code: string, anchorHasValue: boolean): '↓' | '↑' | null => {
    const m = rowMeta.get(code)
    if (!m?.isInGroup || m.isAnchor) return null
    if (!anchorHasValue) return null
    if (m.isFirstInGroup) return '↓'
    if (m.isLastInGroup) return '↑'
    return null
  }

  /** 353: row classes สำหรับ visual brace (theme LF Print post-352)
   *  2px slate-400 horizontal borders ที่ขอบบน/ล่างของกลุ่ม
   */
  const rowCls = (code: string): string => {
    const m = rowMeta.get(code)
    if (!m?.isInGroup) return ''
    return cn(
      m.isFirstInGroup && 'border-t-2 border-t-slate-400',
      m.isLastInGroup && 'border-b-2 border-b-slate-400',
    )
  }

  /** 353: render value with "รวม" label เหนือ anchor cell (theme LF Grid/Print)
   *  - anchor + aggregate column → vertical stack "รวม" label + value
   *  - non-anchor + aggregate column → arrow ↓/↑ (if anchor has value)
   *  - ungrouped → plain value
   */
  const renderCell = (code: string, value: number, anchorValue: number, signed = false): React.ReactNode => {
    const m = rowMeta.get(code)
    const displayVal = (v: number) => {
      if (v === 0) return '-'
      return signed ? (v > 0 ? `+${v}` : `${v}`) : String(v)
    }
    if (m?.isInGroup && m.isAnchor) {
      // 355: "รวม" label แสดงเฉพาะ value ≠ 0 (clean)
      if (value === 0) return '-'
      return (
        <div className="flex flex-col items-end leading-none">
          <span className="text-[8px] text-slate-500 mb-0.5">รวม</span>
          <span>{displayVal(value)}</span>
        </div>
      )
    }
    if (m?.isInGroup && !m.isAnchor) {
      if (value !== 0) return displayVal(value) // per-size adj
      const arr = cellArrow(code, anchorValue !== 0)
      return arr ? <span className="text-slate-400 text-sm">{arr}</span> : '·'
    }
    return displayVal(value)
  }

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
  const hasAggregate = aggGroupInfo.size > 0

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
            {orderedCodes.length === 0 ? (
              <tr><td colSpan={6} className="border border-slate-400 px-4 py-8 text-center text-slate-400">ไม่มีรายการในช่วงเวลานี้</td></tr>
            ) : orderedCodes.map(code => {
              const v1 = compareValues[1][code] || 0
              const v2 = compareValues[2][code] || 0
              const v3 = compareValues[3][code] || 0
              const v4 = compareValues[4][code] || 0
              const m = rowMeta.get(code)
              const anc = m?.isInGroup && !m.isAnchor ? {
                1: compareValues[1][m.anchorCode] || 0,
                2: compareValues[2][m.anchorCode] || 0,
                3: compareValues[3][m.anchorCode] || 0,
                4: compareValues[4][m.anchorCode] || 0,
              } : null
              return (
                <tr key={code} className={rowCls(code)}>
                  <td className="border border-slate-400 px-2 py-1.5 font-mono text-slate-500 align-middle">{code}</td>
                  <td className="border border-slate-400 px-2 py-1.5 align-middle">{itemNameMap[code]}</td>
                  <td className={cn('border border-slate-400 px-2 py-1.5 text-right font-mono align-middle', colorOf(v1))}>{renderCell(code, v1, anc?.[1] || 0, true)}</td>
                  <td className={cn('border border-slate-400 px-2 py-1.5 text-right font-mono align-middle', colorOf(v2))}>{renderCell(code, v2, anc?.[2] || 0, true)}</td>
                  <td className={cn('border border-slate-400 px-2 py-1.5 text-right font-mono align-middle', colorOf(v3))}>{renderCell(code, v3, anc?.[3] || 0, true)}</td>
                  <td className={cn('border border-slate-400 px-2 py-1.5 text-right font-mono align-middle', colorOf(v4))}>{renderCell(code, v4, anc?.[4] || 0, true)}</td>
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
            {orderedCodes.length === 0 ? (
              <tr><td colSpan={days.length + 5} className="border border-slate-400 px-4 py-8 text-center text-slate-400">ไม่มีรายการในช่วงเวลานี้</td></tr>
            ) : orderedCodes.map(code => {
              const b = brought[code] || 0
              const c = carried[code] || 0
              const monthTotal = c - b
              const m = rowMeta.get(code)
              const ancB = m?.isInGroup && !m.isAnchor ? (brought[m.anchorCode] || 0) : 0
              const ancC = m?.isInGroup && !m.isAnchor ? (carried[m.anchorCode] || 0) : 0
              const ancT = ancC - ancB
              const isNonAnchor = !!(m?.isInGroup && !m.isAnchor)
              return (
                <tr key={code} className={rowCls(code)}>
                  <td className="border border-slate-400 px-1 py-1 font-mono text-slate-500 align-middle">{code}</td>
                  <td className="border border-slate-400 px-1 py-1 align-middle">{itemNameMap[code]}</td>
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono align-middle', colorOf(b))}>{renderCell(code, b, ancB, true)}</td>
                  {days.map(day => {
                    const d = isNonAnchor ? computeNonAnchorDailyAdj(code, day) : computeDailyDiff(code, day, mode)
                    const ancD = isNonAnchor ? computeDailyDiff(m!.anchorCode, day, mode) : 0
                    return (
                      <td key={day} className={cn('border border-slate-400 px-0.5 py-1 text-right font-mono align-middle', d === 0 ? 'text-slate-300' : colorOf(d))}>
                        {renderCell(code, d, ancD, true)}
                      </td>
                    )
                  })}
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono bg-blue-50 align-middle', colorOf(monthTotal))}>{renderCell(code, monthTotal, ancT, true)}</td>
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono bg-indigo-50 font-semibold align-middle', colorOf(c))}>{renderCell(code, c, ancC, true)}</td>
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
            {orderedCodes.length === 0 ? (
              <tr><td colSpan={months.length + 5} className="border border-slate-400 px-4 py-8 text-center text-slate-400">ไม่มีรายการในช่วงเวลานี้</td></tr>
            ) : orderedCodes.map(code => {
              const b = brought[code] || 0
              const c = carried[code] || 0
              const yearTotal = c - b
              const m = rowMeta.get(code)
              const ancB = m?.isInGroup && !m.isAnchor ? (brought[m.anchorCode] || 0) : 0
              const ancC = m?.isInGroup && !m.isAnchor ? (carried[m.anchorCode] || 0) : 0
              const ancT = ancC - ancB
              const isNonAnchor = !!(m?.isInGroup && !m.isAnchor)
              return (
                <tr key={code} className={rowCls(code)}>
                  <td className="border border-slate-400 px-1 py-1 font-mono text-slate-500 align-middle">{code}</td>
                  <td className="border border-slate-400 px-1 py-1 align-middle">{itemNameMap[code]}</td>
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono align-middle', colorOf(b))}>{renderCell(code, b, ancB, true)}</td>
                  {months.map(monthYM => {
                    const sum = isNonAnchor ? computeNonAnchorMonthlyAdj(code, monthYM) : computeMonthlySum(code, monthYM, mode)
                    const ancSum = isNonAnchor ? computeMonthlySum(m!.anchorCode, monthYM, mode) : 0
                    return (
                      <td key={monthYM} className={cn('border border-slate-400 px-1 py-1 text-right font-mono align-middle', sum === 0 ? 'text-slate-300' : colorOf(sum))}>
                        {renderCell(code, sum, ancSum, true)}
                      </td>
                    )
                  })}
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono bg-blue-50 align-middle', colorOf(yearTotal))}>{renderCell(code, yearTotal, ancT, true)}</td>
                  <td className={cn('border border-slate-400 px-1 py-1 text-right font-mono bg-indigo-50 font-semibold align-middle', colorOf(c))}>{renderCell(code, c, ancC, true)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* 353: legend สำหรับ aggregate group (theme เดียวกับ LF Print) */}
      {hasAggregate && (
        <div className="mt-2 text-[9px] text-slate-500 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="font-medium">รวม</span> = anchor row (ค่ารวมทั้งกลุ่ม)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-slate-400">↓ / ↑</span> = ค่าอยู่ที่ anchor (ตามทิศที่ลูกศรชี้)
          </span>
        </div>
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
                    {a.autoBalancedAnchor && (
                      <span className="ml-1 text-[9px] text-emerald-700">⚖ balance</span>
                    )}
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
