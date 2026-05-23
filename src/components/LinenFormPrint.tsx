'use client'

import Image from 'next/image'
import { useMemo } from 'react'
import { formatDate, formatNumber, cn } from '@/lib/utils'
import { getGroupAnchorCode } from '@/lib/aggregate-groups'
import type { LinenForm, Customer, CompanyInfo, LinenItemDef, QuotationItem } from '@/types'

interface LinenFormPrintProps {
  form: LinenForm
  customer: Customer
  company: CompanyInfo
  catalog: LinenItemDef[]
  carryOver: Record<string, number>
  qtItems?: QuotationItem[]
}

export default function LinenFormPrint({ form, customer, company, catalog, carryOver, qtItems }: LinenFormPrintProps) {
  // ใช้ชื่อจาก QT ถ้ามี, fallback ไป catalog
  const qtNameMap = qtItems ? Object.fromEntries(qtItems.map(i => [i.code, i.name])) : null
  const catalogNameMap = Object.fromEntries(catalog.map(i => [i.code, i.name]))
  const nameMap = qtNameMap || catalogNameMap

  // 341: aggregate group meta — anchor + col2Agg/col5Agg flags
  //   ใช้ customer.aggregateSizeGroups (ปัจจุบัน) — print ไม่ใช้ form.aggregateSnapshot
  //   เพราะ snapshot เก็บแค่ col2Mode/col5Mode ไม่มี anchorCode
  const aggMeta = useMemo(() => {
    const meta = new Map<string, {
      groupKey: string; anchorCode: string; isAnchor: boolean
      col2Agg: boolean; col5Agg: boolean
      groupSize: number; isFirstInGroup: boolean; isLastInGroup: boolean
    }>()
    if (!customer.aggregateSizeGroups || customer.aggregateSizeGroups.length === 0) return meta
    for (const cfg of customer.aggregateSizeGroups) {
      const col5Agg = (cfg.col5Mode ?? 'aggregate') === 'aggregate'
      const col2Agg = cfg.col2Mode === 'aggregate'
      if (!col5Agg && !col2Agg) continue
      const groupItems = catalog
        .filter(i => i.sizeGroup === cfg.groupKey)
        .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
      if (groupItems.length === 0) continue
      const anchorCode = getGroupAnchorCode(groupItems, cfg.anchorCode)
      groupItems.forEach((item, idx) => {
        meta.set(item.code, {
          groupKey: cfg.groupKey, anchorCode, isAnchor: item.code === anchorCode,
          col2Agg, col5Agg, groupSize: groupItems.length,
          isFirstInGroup: idx === 0, isLastInGroup: idx === groupItems.length - 1,
        })
      })
    }
    return meta
  }, [customer.aggregateSizeGroups, catalog])

  const hasAggregate = aggMeta.size > 0
  const isTrustCustomer = form.workflowMode === 'trust_customer'

  // 341: rearrange rows ให้ group ติดกัน (anchor + members) — pattern จาก LF Grid 326
  const orderedRows = useMemo(() => {
    const baseRows = qtItems
      ? qtItems.map(qi => form.rows.find(r => r.code === qi.code)).filter(Boolean) as typeof form.rows
      : form.rows
    if (!hasAggregate) return baseRows
    const result: typeof form.rows = []
    const seen = new Set<string>()
    for (const row of baseRows) {
      if (seen.has(row.code)) continue
      const m = aggMeta.get(row.code)
      if (m) {
        // dump group members ที่อยู่ใน baseRows ตาม sortOrder
        const groupItems = catalog
          .filter(i => i.sizeGroup === m.groupKey)
          .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
        for (const gi of groupItems) {
          if (seen.has(gi.code)) continue
          const gr = baseRows.find(r => r.code === gi.code)
          if (gr) { result.push(gr); seen.add(gi.code) }
        }
      } else {
        result.push(row); seen.add(row.code)
      }
    }
    return result
  }, [form.rows, qtItems, aggMeta, catalog, hasAggregate])

  // 341: group-aware ค้าง/คืน ที่ anchor row (sum ทั้ง group)
  //   formula เลือก mode ตาม form.workflowMode:
  //     - trust_customer → Mode 2: col6 - (col2 + col3)
  //     - cross_check    → Mode 1: col6 - col5 (default)
  const anchorGroupDiff = useMemo(() => {
    const map = new Map<string, number>()
    for (const [code, m] of aggMeta) {
      if (!m.isAnchor) continue
      const groupCodes = new Set(
        Array.from(aggMeta.entries()).filter(([, mm]) => mm.groupKey === m.groupKey).map(([c]) => c),
      )
      let col2 = 0, col3 = 0, col5 = 0, col6 = 0
      for (const r of form.rows) {
        if (!groupCodes.has(r.code)) continue
        col2 += r.col2_hotelCountIn
        col3 += r.col3_hotelClaimCount
        col5 += r.col5_factoryClaimApproved
        col6 += r.col6_factoryPackSend || 0
      }
      const diff = isTrustCustomer ? col6 - (col2 + col3) : col6 - col5
      map.set(code, diff)
    }
    return map
  }, [aggMeta, form.rows, isTrustCustomer])

  const totalCol2 = form.rows.reduce((s, r) => s + r.col2_hotelCountIn, 0)
  const totalCol3 = form.rows.reduce((s, r) => s + r.col3_hotelClaimCount, 0)
  const totalCol5 = form.rows.reduce((s, r) => s + r.col5_factoryClaimApproved, 0)
  const totalCol6 = form.rows.reduce((s, r) => s + (r.col6_factoryPackSend || 0), 0)
  const totalCol4 = form.rows.reduce((s, r) => s + r.col4_factoryApproved, 0)

  /** 350: directional arrow ↓/↑ สำหรับ non-anchor row (theme LF Grid post-345)
   *  - ↓ ถ้า row อยู่ก่อน anchor (anchor อยู่ข้างล่าง)
   *  - ↑ ถ้า row อยู่หลัง anchor (anchor อยู่ข้างบน)
   */
  const orderedIndex = useMemo(() => {
    const m = new Map<string, number>()
    orderedRows.forEach((r, idx) => m.set(r.code, idx))
    return m
  }, [orderedRows])

  const arrowFor = (code: string): '↓' | '↑' => {
    const m = aggMeta.get(code)
    if (!m) return '↑'
    const myIdx = orderedIndex.get(code) ?? 0
    const ancIdx = orderedIndex.get(m.anchorCode) ?? 0
    return myIdx < ancIdx ? '↓' : '↑'
  }

  /** 350: render aggregate cell — LF Grid post-345 pattern
   *  - anchor row: "รวม" label เหนือ value (vertical stack, small label)
   *  - non-anchor row: directional ↓/↑ arrow
   *  - non-aggregate column: per-row value ปกติ
   */
  const renderAggCell = (
    row: typeof form.rows[number],
    value: number,
    aggColumn: boolean,
    signed = false,  // true = ค้าง/คืน (+/- prefix)
  ) => {
    const m = aggMeta.get(row.code)
    if (m && aggColumn && !m.isAnchor) {
      return <span className="text-slate-400 text-sm" title={`รวมที่ ${m.anchorCode}`}>{arrowFor(row.code)}</span>
    }
    if (m && aggColumn && m.isAnchor) {
      // 355: "รวม" label แสดงเฉพาะ value ≠ 0 (clean — ไม่มีค่า ก็ไม่ใส่ label)
      if (value === 0) return '-'
      const displayVal = signed ? (value > 0 ? `+${value}` : `${value}`) : formatNumber(value)
      return (
        <div className="flex flex-col items-center leading-none">
          <span className="text-[8px] text-slate-500 mb-0.5">รวม</span>
          <span>{displayVal}</span>
        </div>
      )
    }
    // Not in group, or not aggregate column → per-row value
    if (value === 0) return '-'
    return signed ? (value > 0 ? `+${value}` : `${value}`) : formatNumber(value)
  }

  return (
    <div className="bg-white p-6 max-w-[210mm] mx-auto text-xs print:p-0 print:shadow-none" id="print-lf" style={{ breakInside: 'avoid-page' }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-3 border-b border-slate-300 pb-2 print:mb-2 print:pb-1">
        <div className="flex items-start gap-2">
          <Image src="/flowclean-logo.png" alt="FlowClean" width={40} height={40} className="mt-0.5 print:w-[36px] print:h-[36px]" />
          <div>
            <h1 className="text-base font-bold text-[#1B3A5C]">{company.name}</h1>
            <p className="text-[10px] text-slate-500">{company.nameEn}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{company.address}</p>
            <p className="text-[10px] text-slate-500">โทร: {company.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-sm font-bold text-[#1B3A5C]">ใบส่งรับผ้า</h2>
          <p className="text-[10px] text-slate-500">Linen Form</p>
          <p className="font-mono text-xs font-medium mt-1">{form.formNumber}</p>
          <p className="text-xs font-semibold text-[#1B3A5C]">วันที่: {formatDate(form.date)}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-[11px] print:mb-2">
        <div>
          <p className="text-slate-500">ลูกค้า:</p>
          <p className="text-sm font-bold text-slate-900">{customer.shortName || customer.name}</p>
        </div>
        <div className="text-right">
          {form.bagsSentCount > 0 && (
            <p className="text-slate-500">ถุงส่งซัก: <span className="text-slate-800 font-medium">{form.bagsSentCount}</span></p>
          )}
          {form.bagsPackCount > 0 && (
            <p className="text-slate-500">ถุงแพคส่ง: <span className="text-slate-800 font-medium">{form.bagsPackCount}</span></p>
          )}
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-[11px] border border-slate-300">
        <thead>
          <tr className="bg-slate-100">
            <th className="px-1.5 py-1.5 border border-slate-300 text-left w-12">รหัส</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-left">รายการ</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-12">ยกยอด</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">ส่งซัก</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-12">เคลม</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">นับเข้า</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">แพคส่ง</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">ค้าง/คืน</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-left w-20">หมายเหตุ</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">นับกลับ</th>
          </tr>
        </thead>
        <tbody>
          {orderedRows.map(row => {
            const m = aggMeta.get(row.code)
            const co = carryOver[row.code] || 0
            // 341: ค้าง/คืน calculation
            //   - non-aggregate: per-row formula (เดิม) col6 - col5 (หรือ Mode 2 ถ้า trust)
            //   - aggregate anchor: group-aware sum
            //   - aggregate non-anchor: '↑' (value at anchor)
            let diff: number
            if (m?.isAnchor && anchorGroupDiff.has(row.code)) {
              diff = anchorGroupDiff.get(row.code)!
            } else if (m && !m.isAnchor) {
              diff = 0 // non-anchor ใน aggregate group → ไม่มี diff per-row (อยู่ที่ anchor)
            } else {
              diff = isTrustCustomer
                ? (row.col6_factoryPackSend || 0) - (row.col2_hotelCountIn + row.col3_hotelClaimCount)
                : (row.col6_factoryPackSend || 0) - row.col5_factoryClaimApproved
            }
            // 341 + 352: visual brace — เส้นแนวนอน 2px slate-400 (เลย iter 2)
            //   ลบเส้นแนวตั้ง (border-l/r) ออก · 2px slate-500 → 1px slate-400 (บางไป) →
            //   2px slate-400: หนาเดิม + สีอ่อนกว่า = เห็นชัดแต่ไม่ดิ่ง
            const rowCls = m ? cn(
              'group-row',
              m.isFirstInGroup && 'border-t-2 border-t-slate-400',
              m.isLastInGroup && 'border-b-2 border-b-slate-400',
            ) : ''
            return (
              <tr key={row.code} className={rowCls} style={{ breakInside: 'avoid' }}>
                <td className="px-1.5 py-1 border border-slate-300 font-mono text-[10px] align-middle">{row.code}</td>
                {/* 350: ลบ badge/anchor hint — uniform เหมือน LF Grid */}
                <td className="px-1.5 py-1 border border-slate-300 align-middle">
                  {nameMap[row.code] || row.code}
                </td>
                {/* ยกยอด — aggregate (stored at anchor) — 350: "รวม" label เหนือ value */}
                <td className="px-1.5 py-1 border border-slate-300 text-right align-middle">
                  {renderAggCell(row, co, !!m, true)}
                </td>
                {/* ส่งซัก (col2) — aggregate ถ้า col2Agg */}
                <td className="px-1.5 py-1 border border-slate-300 text-right align-middle">
                  {renderAggCell(row, row.col2_hotelCountIn, !!m?.col2Agg)}
                </td>
                {/* เคลม (col3) — per-row */}
                <td className="px-1.5 py-1 border border-slate-300 text-right align-middle">
                  {row.col3_hotelClaimCount || '-'}
                </td>
                {/* นับเข้า (col5) — aggregate ถ้า col5Agg */}
                <td className="px-1.5 py-1 border border-slate-300 text-right align-middle">
                  {renderAggCell(row, row.col5_factoryClaimApproved, !!m?.col5Agg)}
                </td>
                {/* แพคส่ง (col6) — per-row */}
                <td className="px-1.5 py-1 border border-slate-300 text-right align-middle">
                  {row.col6_factoryPackSend || '-'}
                </td>
                {/* ค้าง/คืน — 350: "รวม" label เหนือ value ที่ anchor (theme LF Grid) */}
                <td className={cn('px-1.5 py-1 border border-slate-300 text-right align-middle',
                  diff > 0 && 'text-emerald-600', diff < 0 && 'text-red-600')}>
                  {renderAggCell(row, diff, !!m, true)}
                </td>
                {/* หมายเหตุ */}
                <td className="px-1.5 py-1 border border-slate-300 text-[10px] align-middle">{row.note || '-'}</td>
                {/* นับกลับ (col4) — per-row */}
                <td className="px-1.5 py-1 border border-slate-300 text-right align-middle">
                  {row.col4_factoryApproved || '-'}
                </td>
              </tr>
            )
          })}
          <tr className="bg-slate-50 font-medium">
            <td colSpan={2} className="px-1.5 py-1.5 border border-slate-300 text-right">รวม</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right"></td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol2)}</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol3)}</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol5)}</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol6)}</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right"></td>
            <td className="px-1.5 py-1.5 border border-slate-300"></td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol4)}</td>
          </tr>
        </tbody>
      </table>

      {/* 350: legend สำหรับ aggregate group (theme LF Grid) */}
      {hasAggregate && (
        <div className="mt-2 text-[10px] text-slate-500 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="font-medium">รวม</span> = anchor row (ค่ารวมทั้งกลุ่ม)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-slate-400">↓ / ↑</span> = ค่าอยู่ที่ anchor row (ตามทิศที่ลูกศรชี้)
          </span>
        </div>
      )}

      {/* Notes */}
      {form.notes && (
        <div className="mt-2 text-[11px] text-slate-600">
          <p className="font-medium">หมายเหตุ: {form.notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-8 mt-6 text-[11px] text-center print:mt-4" style={{ breakInside: 'avoid', breakBefore: 'avoid' }}>
        <div>
          <div className="border-b border-slate-300 pb-6 mb-1"></div>
          <p className="text-slate-500">ผู้ส่ง</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-6 mb-1"></div>
          <p className="text-slate-500">ผู้ตรวจสอบ</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-6 mb-1"></div>
          <p className="text-slate-500">ผู้รับ</p>
        </div>
      </div>
    </div>
  )
}
