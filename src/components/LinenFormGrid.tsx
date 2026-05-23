'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Trash2, Zap, Check, Anchor } from 'lucide-react'
import type { LinenFormRow, Customer, LinenItemDef, LinenFormStatus, QuotationItem, WorkflowMode } from '@/types'
import { cn } from '@/lib/utils'
import { wasSynced } from '@/lib/sync-discrepancy'
import { resolveDisplayName } from '@/lib/facet-generators'
import { highlightText } from '@/lib/highlight'
import { getGroupAnchorCode } from '@/lib/aggregate-groups'

interface LinenFormGridProps {
  customer: Customer
  rows: LinenFormRow[]
  onChange: (rows: LinenFormRow[]) => void
  catalog: LinenItemDef[]
  itemCodes?: string[]  // override customer.enabledItems (e.g. from accepted QT)
  qtItems?: QuotationItem[]  // QT items — ใช้ลำดับ + ชื่อจาก QT แทน catalog
  carryOver?: Record<string, number>
  formDate?: string
  headerLabel?: string  // แสดงเหนือ header (เช่น "ลูกค้า: X | วันที่: Y")
  readOnly?: boolean
  editableColumns?: ('col1' | 'col2' | 'col3' | 'col4' | 'col5' | 'col6' | 'note')[]
  formStatus?: LinenFormStatus
  /** 70+73+74+75: One-click sync (⚡) — ถ้ามี = แสดงปุ่ม ⚡ ที่ row ที่มี discrepancy */
  onApproveSync?: (code: string) => void
  /** 233: highlight query — wrap matches in <mark> ใน item.code/name (ใช้กับ Cmd+K + FindBar) */
  highlightQ?: string
  /** 270: override workflowMode — caller (LF detail) ส่ง LF snapshot ป้องกัน drift เมื่อ customer toggle */
  workflowModeOverride?: WorkflowMode
}

const COL_LABELS = [
  { key: 'col1', label: 'ยกยอดมา', short: 'ยกมา', tip: 'ยอดค้างจากรอบก่อน: ลบ=ค้างส่ง, บวก=ส่งเกิน (คำนวณอัตโนมัติ)' },
  { key: 'col2', label: 'ลูกค้านับผ้าส่งซัก', short: 'ส่งซัก', tip: 'จำนวนผ้าที่ลูกค้านับส่งมาซัก' },
  { key: 'col3', label: 'ลูกค้านับผ้าส่งเคลม', short: 'ส่งเคลม', tip: 'จำนวนผ้าที่ลูกค้าแจ้งเคลม (ชำรุด/เสียหาย)' },
  { key: 'col5', label: 'โรงซักนับเข้า', short: 'นับเข้า', tip: 'จำนวนผ้าที่โรงซักนับรับเข้าจริง' },
  { key: 'col6', label: 'โรงซักแพคส่ง', short: 'แพคส่ง', tip: 'จำนวนผ้าที่โรงซักแพคส่งกลับลูกค้า' },
  { key: 'calc', label: '(-) = ผ้าค้าง / (+) = คืนค้าง', short: 'ค้าง/คืน', tip: 'แพคส่ง - นับเข้า: ลบ(แดง)=ผ้าค้าง, บวก(เขียว)=คืนค้าง' },
  { key: 'note', label: 'หมายเหตุ', short: 'Note', tip: 'บันทึกเพิ่มเติม เช่น ผ้าชำรุด สีตก' },
  { key: 'col4', label: 'ลูกค้านับผ้ากลับ', short: 'นับกลับ', tip: 'จำนวนผ้าที่ลูกค้านับรับกลับ (⚠ ถ้าไม่ตรงกับแพคส่ง)' },
] as const

// Column index for arrow navigation (position within editable inputs per row)
const COL_NAV_INDEX: Record<string, number> = {
  col2: 0, col3: 1, col5: 2, col6: 3, note: 4, col4: 5,
}

export default function LinenFormGrid({
  customer,
  rows,
  onChange,
  catalog,
  itemCodes,
  qtItems,
  carryOver = {},
  formDate,
  headerLabel,
  readOnly = false,
  editableColumns = ['col2', 'col3', 'col4', 'col5', 'col6', 'note'],
  formStatus,
  onApproveSync,
  highlightQ = '',
  workflowModeOverride,
}: LinenFormGridProps) {
  // 270 — workflowMode: ใช้ override (LF snapshot) ก่อน, fallback ไป customer.workflowMode
  //   ป้องกัน drift: LF เก่าที่ snapshot 'cross_check' ไว้ต้องคงพฤติกรรม cross_check
  //   แม้ customer.workflowMode ถูก toggle เป็น trust_customer ภายหลัง
  // 268 — trust_customer: col5 disabled แสดง "—" / col4 (ลูกค้านับกลับ) ยัง editable
  //   carry-over คำนวณจาก col6 − (col2+col3) แทน col6 − col5
  const workflowMode = workflowModeOverride ?? customer.workflowMode ?? 'cross_check'
  const isTrustCustomer = workflowMode === 'trust_customer'

  // ถ้ามี qtItems → ใช้ลำดับ + ชื่อจาก QT, fallback ไป catalog
  // 213.2 Phase 1.2 — apply customer.itemNicknames เป็น display alias (override ชื่อ)
  const baseItems: LinenItemDef[] = qtItems
    ? qtItems.map(qi => {
        const catItem = catalog.find(c => c.code === qi.code)
        return {
          code: qi.code,
          name: resolveDisplayName(qi.code, qi.name, customer.itemNicknames),
          nameEn: catItem?.nameEn || '',
          category: catItem?.category || 'other',
          unit: catItem?.unit || 'ชิ้น',
          defaultPrice: qi.pricePerUnit,
          sortOrder: 0,
        }
      })
    : catalog
        // 226.B: ไม่ fallback ไป customer.enabledItems — ถ้าไม่มี itemCodes (จาก QT) = empty
        .filter(item => itemCodes ? itemCodes.includes(item.code) : false)
        .map(item => ({
          ...item,
          name: resolveDisplayName(item.code, item.name, customer.itemNicknames),
        }))

  // 269: Orphan-safe — append rows ที่มีข้อมูลกรอกไว้แต่ code ไม่อยู่ใน baseItems
  //   เคส: customer ไม่มี accepted QT → baseItems = [] → grid ว่าง แม้ rows มีข้อมูล
  //   หรือ LF เก่ามี item code ที่ QT ปัจจุบันถอดออกแล้ว → orphan
  //   Append ตอนท้าย กรอกต่อ/ดู/แก้ได้ ไม่เสียข้อมูล
  const baseCodes = new Set(baseItems.map(i => i.code))
  const orphanItems: LinenItemDef[] = rows
    .filter(r => !baseCodes.has(r.code))
    .filter(r => (r.col2_hotelCountIn || 0) || (r.col3_hotelClaimCount || 0)
      || (r.col4_factoryApproved || 0) || (r.col5_factoryClaimApproved || 0)
      || (r.col6_factoryPackSend || 0) || r.note)
    .map(r => {
      const catItem = catalog.find(c => c.code === r.code)
      return {
        code: r.code,
        name: resolveDisplayName(r.code, catItem?.name || r.code, customer.itemNicknames),
        nameEn: catItem?.nameEn || '',
        category: catItem?.category || 'other',
        unit: catItem?.unit || 'ชิ้น',
        defaultPrice: 0,
        sortOrder: 999,
      }
    })
  const rawItems: LinenItemDef[] = [...baseItems, ...orphanItems]

  // 326: Auto-rearrange — group items ที่ลูกค้า opt-in aggregate ติดกัน
  // Order สัมพัทธ์ของแต่ละ group คงเดิม (first occurrence ใน rawItems)
  // Items ที่ไม่อยู่ในกลุ่ม → คงตำแหน่งเดิม
  // 326: Catalog map (code → catalog item) — ใช้ใน sort + aggregate detection
  const catalogMap = useMemo(() => new Map(catalog.map(c => [c.code, c])), [catalog])
  const optInGroupKeys = useMemo(
    () => new Set((customer.aggregateSizeGroups ?? []).map(c => c.groupKey)),
    [customer.aggregateSizeGroups],
  )

  const enabledItems: LinenItemDef[] = useMemo(() => {
    if (optInGroupKeys.size === 0) return rawItems
    const seen = new Set<string>()
    const result: LinenItemDef[] = []
    for (const item of rawItems) {
      if (seen.has(item.code)) continue
      const groupKey = catalogMap.get(item.code)?.sizeGroup
      if (groupKey && optInGroupKeys.has(groupKey)) {
        // First occurrence ของ group → push all group items ติดกัน
        const groupItems = rawItems.filter(
          it => catalogMap.get(it.code)?.sizeGroup === groupKey,
        )
        for (const gi of groupItems) {
          if (!seen.has(gi.code)) {
            result.push(gi)
            seen.add(gi.code)
          }
        }
      } else {
        result.push(item)
        seen.add(item.code)
      }
    }
    return result
    // rawItems sufficient — เพราะ contents ขึ้นกับ catalog/qtItems/rows ที่ใส่ใน deps แล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogMap, optInGroupKeys, baseItems, orphanItems.length])

  // 326: aggregateMeta per code — anchor flag + col2/col5 aggregate mode + group geometry
  interface AggregateMeta {
    groupKey: string
    isAnchor: boolean
    isFirstInGroup: boolean
    isLastInGroup: boolean
    col2Aggregate: boolean
    col5Aggregate: boolean
    anchorCode: string
    groupSize: number
  }
  const aggregateMeta = useMemo(() => {
    const map = new Map<string, AggregateMeta>()
    if (optInGroupKeys.size === 0) return map
    const cfgByKey = new Map((customer.aggregateSizeGroups ?? []).map(c => [c.groupKey, c]))
    // Build groups เฉพาะ codes ใน enabledItems
    const codesByGroup = new Map<string, string[]>()
    for (const item of enabledItems) {
      const gk = catalogMap.get(item.code)?.sizeGroup
      if (!gk || !optInGroupKeys.has(gk)) continue
      if (!codesByGroup.has(gk)) codesByGroup.set(gk, [])
      codesByGroup.get(gk)!.push(item.code)
    }
    for (const [groupKey, codes] of codesByGroup.entries()) {
      const cfg = cfgByKey.get(groupKey)
      if (!cfg) continue
      const groupItems = codes
        .map(c => catalogMap.get(c))
        .filter((i): i is LinenItemDef => !!i)
      const anchor = getGroupAnchorCode(groupItems, cfg.anchorCode)
      const col2Agg = cfg.col2Mode === 'aggregate'
      const col5Agg = (cfg.col5Mode ?? 'aggregate') === 'aggregate'
      codes.forEach((code, idx) => {
        map.set(code, {
          groupKey,
          isAnchor: code === anchor,
          isFirstInGroup: idx === 0,
          isLastInGroup: idx === codes.length - 1,
          col2Aggregate: col2Agg,
          col5Aggregate: col5Agg,
          anchorCode: anchor,
          groupSize: codes.length,
        })
      })
    }
    return map
  }, [enabledItems, optInGroupKeys, catalogMap, customer.aggregateSizeGroups])

  // 326: focus to anchor row helper — click ที่ non-anchor cell
  const focusAnchorCell = (anchorCode: string, colNavIndex: number) => {
    const anchorIdx = enabledItems.findIndex(it => it.code === anchorCode)
    if (anchorIdx < 0) return
    setTimeout(() => {
      const el = gridRef.current?.querySelector<HTMLInputElement>(
        `input[data-row="${anchorIdx}"][data-col="${colNavIndex}"]`,
      )
      if (el) {
        el.focus()
        el.select()
      }
    }, 0)
  }

  const [localRows, setLocalRows] = useState<LinenFormRow[]>(rows)
  const [activeRowIdx, setActiveRowIdx] = useState<number | null>(null)
  const [activeColIdx, setActiveColIdx] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // 328.1/328.2: focused aggregate group — drives arrow + border active state
  //   ทุก cell ในกลุ่มเดียวกัน (anchor row + non-anchor rows) ใช้สถานะนี้
  //   เปลี่ยนสีพร้อมกันเมื่อ cursor อยู่ที่ anchor input ของกลุ่มนั้น
  const focusedAgg = useMemo<{ groupKey: string; col: 'col2' | 'col5' } | null>(() => {
    if (activeRowIdx === null || activeColIdx === null) return null
    const activeItem = enabledItems[activeRowIdx]
    if (!activeItem) return null
    const agg = aggregateMeta.get(activeItem.code)
    if (!agg || !agg.isAnchor) return null
    if (activeColIdx === COL_NAV_INDEX.col2 && agg.col2Aggregate) {
      return { groupKey: agg.groupKey, col: 'col2' }
    }
    if (activeColIdx === COL_NAV_INDEX.col5 && agg.col5Aggregate) {
      return { groupKey: agg.groupKey, col: 'col5' }
    }
    return null
  }, [activeRowIdx, activeColIdx, enabledItems, aggregateMeta])

  const isAggGroupActive = (groupKey: string | undefined, col: 'col2' | 'col5') => {
    if (!groupKey) return false
    return focusedAgg?.groupKey === groupKey && focusedAgg?.col === col
  }

  // 328.1: clear active states when focus leaves grid entirely
  //   relatedTarget ถ้าอยู่ใน grid = user แค่เลื่อน cell → ไม่ clear
  //   ถ้าอยู่นอก grid (click ออกข้างนอก) = clear ทั้ง row + col
  const handleGridBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null
    if (!next || !gridRef.current?.contains(next)) {
      setActiveColIdx(null)
      setActiveRowIdx(null)
    }
  }

  useEffect(() => {
    setLocalRows(rows)
  }, [rows])

  const getRow = (code: string): LinenFormRow => {
    return localRows.find(r => r.code === code) || {
      code, col1_carryOver: 0, col2_hotelCountIn: 0, col3_hotelClaimCount: 0,
      col4_factoryApproved: 0, col5_factoryClaimApproved: 0, col6_factoryPackSend: 0, note: '',
    }
  }

  const updateRow = (code: string, field: string, value: number | string) => {
    const updated = localRows.map(r => {
      if (r.code !== code) return r
      return { ...r, [field]: value }
    })
    if (!updated.find(r => r.code === code)) {
      const newRow = { ...getRow(code), [field]: value }
      updated.push(newRow)
    }
    setLocalRows(updated)
    onChange(updated)
  }

  // 59: Clear all editable cells in this grid
  const handleClearAll = () => {
    if (readOnly) return
    if (!confirm('ต้องการเคลียร์ข้อมูลทั้งหมดในตารางนี้หรือไม่?\n\nระบบจะรีเซ็ตค่าทุก cell ที่กรอกได้ (col2, col3, col4, col5, col6, หมายเหตุ) เป็น 0 / ค่าว่าง\n\n⚠ ไม่สามารถเรียกคืนได้')) return
    const cleared = localRows.map(r => ({
      ...r,
      ...(editableColumns.includes('col2') ? { col2_hotelCountIn: 0 } : {}),
      ...(editableColumns.includes('col3') ? { col3_hotelClaimCount: 0 } : {}),
      ...(editableColumns.includes('col4') ? { col4_factoryApproved: 0 } : {}),
      ...(editableColumns.includes('col5') ? { col5_factoryClaimApproved: 0 } : {}),
      ...(editableColumns.includes('col6') ? { col6_factoryPackSend: 0 } : {}),
      ...(editableColumns.includes('note') ? { note: '' } : {}),
    }))
    setLocalRows(cleared)
    onChange(cleared)
  }

  // Arrow key + Enter navigation — เลื่อน cell ใน grid เท่านั้น (ข้ามกล่อง/ปุ่มใช้ Tab/Shift+Tab)
  // scroll ให้ cell ไม่ถูก sticky header บัง (ทั้ง navy bar + column header)
  const scrollCellVisible = (el: HTMLElement) => {
    // รอ browser focus scroll เสร็จ → adjust ให้ cell ไม่ถูก sticky header บัง
    setTimeout(() => {
      const scrollParent = document.querySelector('.max-h-\\[94vh\\] > .overflow-auto') as HTMLElement | null
      if (!scrollParent) return
      const thead = gridRef.current?.querySelector('thead')
      const headerH = thead ? thead.getBoundingClientRect().height : 0
      const elRect = el.getBoundingClientRect()
      const parentRect = scrollParent.getBoundingClientRect()
      const gap = 16 // padding ให้เห็นสวย
      if (elRect.top < parentRect.top + headerH + gap) {
        scrollParent.scrollTop -= (parentRect.top + headerH + gap - elRect.top)
      }
      if (elRect.bottom > parentRect.bottom - gap) {
        scrollParent.scrollTop += (elRect.bottom - parentRect.bottom + gap)
      }
    }, 50)
  }

  const navigate = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number
  ) => {
    const container = gridRef.current
    if (!container) return

    // Enter (58): jump to first editable cell of next row · 327.1: skip rows without input
    if (e.key === 'Enter') {
      let nextRow = rowIndex + 1
      while (nextRow < enabledItems.length) {
        const nextRowInputs = Array.from(
          container.querySelectorAll<HTMLInputElement>(`input[data-row="${nextRow}"]`)
        ).sort((a, b) => Number(a.dataset.col) - Number(b.dataset.col))
        const first = nextRowInputs[0]
        if (first) {
          e.preventDefault()
          first.focus()
          first.select()
          setActiveRowIdx(nextRow)
          const tr = first.closest('tr')
          if (tr) scrollCellVisible(tr)
          return
        }
        nextRow++
      }
      return
    }

    // Arrow keys: ปกติ
    let dRow = 0, dCol = 0
    if (e.key === 'ArrowUp') dRow = -1
    else if (e.key === 'ArrowDown') dRow = 1
    else if (e.key === 'ArrowLeft') dCol = -1
    else if (e.key === 'ArrowRight') dCol = 1
    else return

    if (dRow !== 0) {
      // 327.1: skip rows ที่ไม่มี input (aggregate non-anchor cells) — เลื่อนต่อจนเจอ
      let targetRow = rowIndex + dRow
      while (targetRow >= 0 && targetRow < enabledItems.length) {
        const target = container.querySelector<HTMLInputElement>(
          `input[data-row="${targetRow}"][data-col="${colIndex}"]`
        )
        if (target) {
          e.preventDefault()
          target.focus()
          target.select()
          setActiveRowIdx(targetRow)
          const tr = target.closest('tr')
          if (tr) scrollCellVisible(tr)
          return
        }
        targetRow += dRow
      }
      return
    }
    if (dCol !== 0) {
      const rowInputs = Array.from(
        container.querySelectorAll<HTMLInputElement>(`input[data-row="${rowIndex}"]`)
      ).sort((a, b) => Number(a.dataset.col) - Number(b.dataset.col))
      const cur = rowInputs.findIndex(i => Number(i.dataset.col) === colIndex)
      const next = rowInputs[cur + dCol]
      if (next) { e.preventDefault(); next.focus(); next.select() }
    }
  }

  const isEditable = (colKey: string) => {
    if (readOnly) return false
    // 268 — trust_customer: col5 (โรงซักนับเข้า) ไม่ editable
    //   col4 (ลูกค้านับกลับ) ยัง editable เพื่อ cross-check ครั้งที่ 2
    if (isTrustCustomer && colKey === 'col5') return false
    return editableColumns.includes(colKey as typeof editableColumns[number])
  }

  const hasCarryOver = Object.keys(carryOver).some(k => carryOver[k] !== 0)

  const totals = {
    col1: 0, col2: 0, col3: 0, col4: 0, col5: 0, col6: 0,
  }
  // 333.1 + 334: pre-compute group sums
  //   - carry (Col(-)/(+)): col6, baseline
  //   - countIn discrepancy: col5, expected (col2+col3)
  //   baseline = col5 (cross_check) หรือ col2+col3 (trust)
  const groupSums: Record<string, { col6: number; baseline: number; col5: number; expected: number }> = {}
  for (const item of enabledItems) {
    const row = getRow(item.code)
    const co = carryOver[item.code] || 0
    totals.col1 += co
    totals.col2 += row.col2_hotelCountIn
    totals.col3 += row.col3_hotelClaimCount
    totals.col4 += row.col4_factoryApproved
    totals.col5 += row.col5_factoryClaimApproved
    totals.col6 += (row.col6_factoryPackSend || 0)
    // accumulate group sum
    const meta = aggregateMeta.get(item.code)
    if (meta) {
      if (!groupSums[meta.groupKey]) groupSums[meta.groupKey] = { col6: 0, baseline: 0, col5: 0, expected: 0 }
      groupSums[meta.groupKey].col6 += row.col6_factoryPackSend || 0
      groupSums[meta.groupKey].baseline += isTrustCustomer
        ? (row.col2_hotelCountIn + row.col3_hotelClaimCount)
        : row.col5_factoryClaimApproved
      groupSums[meta.groupKey].col5 += row.col5_factoryClaimApproved
      groupSums[meta.groupKey].expected += row.col2_hotelCountIn + row.col3_hotelClaimCount
    }
  }

  return (
    <div ref={gridRef} onBlur={handleGridBlur}>
      {/* Date display */}
      {formDate && (
        <div className="mb-2 text-sm text-slate-600">
          <span className="font-medium">วันที่:</span> {formDate}
        </div>
      )}

      {/* Carry-over alert */}
      {hasCarryOver && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-1">ยกยอดจากรอบก่อน:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(carryOver).filter(([, qty]) => qty !== 0).map(([code, qty]) => (
              <span key={code} className={cn(
                'text-xs px-2 py-1 rounded',
                qty < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
              )}>
                {code} {qty > 0 ? '+' : ''}{qty}
                {qty < 0 ? ' (ค้างส่ง)' : ' (ส่งเกิน)'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grid — no overflow wrapper; sticky thead works relative to parent scroll (modal body) */}
      <div className="border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            {headerLabel && (
              <tr className="bg-[#1B3A5C]">
                <th colSpan={99} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white tracking-wide">{headerLabel}</span>
                    {!readOnly && (
                      <button onClick={handleClearAll}
                        title="เคลียร์ข้อมูลทั้งหมดในตาราง"
                        className="px-2 py-0.5 text-[11px] font-medium text-white/80 hover:text-white hover:bg-white/10 rounded flex items-center gap-1 transition-colors">
                        <Trash2 className="w-3 h-3" />
                        เคลียร์ทั้งหมด
                      </button>
                    )}
                  </div>
                </th>
              </tr>
            )}
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-600 w-16 bg-slate-50">รหัส</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600 w-32 bg-slate-50">รายการ</th>
              {COL_LABELS.map(col => {
                const editable = isEditable(col.key)
                return (
                  <th key={col.key} title={col.tip} className={cn(
                    'px-3 py-2 font-medium text-center cursor-help',
                    col.key === 'note' ? 'w-32 text-left' : 'w-20',
                    editable
                      ? 'text-[#1B3A5C] bg-teal-50 border-b-2 border-[#3DD8D8]'
                      : 'text-slate-600 bg-slate-50'
                  )}>
                    <span className="hidden sm:inline">{col.label}</span>
                    <span className="sm:hidden">{col.short}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {enabledItems.map((item, rowIndex) => {
              const row = getRow(item.code)
              const co = carryOver[item.code] || 0
              const expectedCountIn = row.col2_hotelCountIn + row.col3_hotelClaimCount
              // 326: aggregate meta — anchor + group geometry for cell rendering
              const aggMeta = aggregateMeta.get(item.code) || null
              // 334: group-aware disc — เมื่อ col5 หรือ col2 เป็น aggregate
              //   per-row check ใช้ไม่ได้ (ค่าที่ non-anchor = 0 → false positive)
              //   แทนที่ → group level: sum(col5_group) ≠ sum(col2+col3_group) → flag เฉพาะ anchor
              const isAggDisc = !!(aggMeta && (aggMeta.col5Aggregate || aggMeta.col2Aggregate))
              const hasCountInDisc = (() => {
                if (isAggDisc && aggMeta) {
                  // group-level — flag เฉพาะ anchor row
                  const gs = groupSums[aggMeta.groupKey]
                  if (!gs) return false
                  return aggMeta.isAnchor && gs.col5 > 0 && gs.col5 !== gs.expected
                }
                // per-row (เดิม)
                return row.col5_factoryClaimApproved > 0 && row.col5_factoryClaimApproved !== expectedCountIn
              })()
              const packSend = row.col6_factoryPackSend || 0
              const hasCountBackDisc = (!formStatus || ['delivered', 'confirmed'].includes(formStatus)) &&
                row.col4_factoryApproved > 0 && row.col4_factoryApproved !== packSend
              // 331/332: full-width aggregate group borders — เส้นขอบยาวเต็ม row
              //   ใช้ "border-bottom ของ row ก่อน" เป็นเส้นบนของกลุ่ม → กัน CSS collapse conflict
              //   (browser ตัดสินใจระหว่าง border-bottom slate-100 (row ก่อน) กับ border-top slate-300
              //    เมื่อ width เท่ากัน → ผลลัพธ์ไม่แน่นอนใน Tailwind v4)
              const aggBorderActive = !!(
                aggMeta && (
                  (aggMeta.col2Aggregate && isAggGroupActive(aggMeta.groupKey, 'col2')) ||
                  (aggMeta.col5Aggregate && isAggGroupActive(aggMeta.groupKey, 'col5'))
                )
              )
              const showAggBorder = !!(aggMeta && (aggMeta.col2Aggregate || aggMeta.col5Aggregate))
              const isLastInAggGroup = !!(showAggBorder && aggMeta?.isLastInGroup)

              // Peek row ถัดไป — ถ้า next เป็น first-in-group → row นี้ render border-bottom เป็นเส้นบนของกลุ่ม
              const nextItem = enabledItems[rowIndex + 1]
              const nextAggMeta = nextItem ? aggregateMeta.get(nextItem.code) || null : null
              const nextShowAggBorder = !!(nextAggMeta && (nextAggMeta.col2Aggregate || nextAggMeta.col5Aggregate))
              const nextIsFirstInAggGroup = !!(nextShowAggBorder && nextAggMeta?.isFirstInGroup)
              const nextAggBorderActive = !!(
                nextAggMeta && (
                  (nextAggMeta.col2Aggregate && isAggGroupActive(nextAggMeta.groupKey, 'col2')) ||
                  (nextAggMeta.col5Aggregate && isAggGroupActive(nextAggMeta.groupKey, 'col5'))
                )
              )

              // เคสพิเศษ: row แรกของ table เป็น first-in-group → ต้องใช้ border-top ของตัวเอง (ไม่มี row ก่อน)
              const isFirstRowAndFirstInGroup = rowIndex === 0 && !!(showAggBorder && aggMeta?.isFirstInGroup)

              // Bottom border resolution (ลำดับ priority):
              //   1. isLastInAggGroup → ใช้สีของกลุ่มตัวเอง
              //   2. nextIsFirstInAggGroup → ใช้สีของกลุ่มถัดไป (ทำหน้าที่เป็นเส้นบนของ next group)
              //   3. default → slate-100
              let bottomBorderClass = 'border-b border-b-slate-100'
              if (isLastInAggGroup) {
                bottomBorderClass = aggBorderActive ? 'border-b border-b-[#3DD8D8]' : 'border-b border-b-slate-300'
              } else if (nextIsFirstInAggGroup) {
                bottomBorderClass = nextAggBorderActive ? 'border-b border-b-[#3DD8D8]' : 'border-b border-b-slate-300'
              }

              return (
                <tr key={item.code} className={cn(
                  'transition-colors',
                  bottomBorderClass,
                  // เคสพิเศษ row แรกของ table — ต้องใส่ border-top ของตัวเอง
                  isFirstRowAndFirstInGroup && (aggBorderActive ? 'border-t border-t-[#3DD8D8]' : 'border-t border-t-slate-300'),
                  activeRowIdx === rowIndex ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50'
                )}>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{highlightText(item.code, highlightQ)}</td>
                  <td className={cn('px-3 py-1.5', activeRowIdx === rowIndex ? 'text-[#1B3A5C] font-semibold' : 'text-slate-700')}>{highlightText(item.name, highlightQ)}</td>

                  {/* Col 1 - ยกยอดมา (auto) */}
                  <td className="px-1 py-1 text-center">
                    <span className={cn(
                      'text-slate-700',
                      co < 0 && 'text-red-600 font-medium',
                      co > 0 && 'text-emerald-600 font-medium',
                    )}>
                      {co !== 0 ? (co > 0 ? `+${co}` : co) : '-'}
                    </span>
                  </td>

                  {/* Col 2 - ลูกค้านับส่ง · 331: borders ย้ายไป tr (full-width) */}
                  <td className="px-1 py-1 text-center">
                    {aggMeta?.col2Aggregate ? (
                      aggMeta.isAnchor ? (
                        // Anchor: input + label "รวม" (teal when group active)
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            'text-[10px] leading-none mb-0.5 transition-colors',
                            isAggGroupActive(aggMeta.groupKey, 'col2')
                              ? 'text-[#3DD8D8] font-semibold'
                              : 'text-slate-500',
                          )}>
                            รวม
                          </div>
                          {isEditable('col2') ? (
                            <input
                              type="text" inputMode="numeric" pattern="[0-9]*"
                              data-row={rowIndex} data-col={COL_NAV_INDEX.col2}
                              value={row.col2_hotelCountIn || ''}
                              onChange={e => {
                                const v = e.target.value
                                if (v === '' || /^\d+$/.test(v))
                                  updateRow(item.code, 'col2_hotelCountIn', v === '' ? 0 : parseInt(v, 10))
                              }}
                              onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); setActiveColIdx(COL_NAV_INDEX.col2); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                              onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col2)}
                              className="w-16 px-2 py-1 border border-slate-300 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none"
                            />
                          ) : (
                            <span className="text-slate-700">{row.col2_hotelCountIn || '-'}</span>
                          )}
                        </div>
                      ) : (
                        // Non-anchor: arrow ↓ ถ้าอยู่ก่อน anchor / ↑ ถ้าอยู่หลัง
                        (() => {
                          const anchorIdx = enabledItems.findIndex(it => it.code === aggMeta.anchorCode)
                          const dir = rowIndex < anchorIdx ? '↓' : '↑'
                          const active = isAggGroupActive(aggMeta.groupKey, 'col2')
                          return (
                            <button
                              type="button"
                              onClick={() => isEditable('col2') && focusAnchorCell(aggMeta.anchorCode, COL_NAV_INDEX.col2)}
                              disabled={!isEditable('col2')}
                              title={isEditable('col2') ? 'ค่ารวมอยู่ที่ row anchor — คลิกเพื่อ focus' : 'ค่ารวมอยู่ที่ row anchor'}
                              className={cn(
                                'text-sm transition-colors disabled:cursor-default',
                                active ? 'text-[#3DD8D8]' : 'text-slate-400 hover:text-[#3DD8D8]',
                              )}
                            >
                              {dir}
                            </button>
                          )
                        })()
                      )
                    ) : (
                      isEditable('col2') ? (
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          data-row={rowIndex} data-col={COL_NAV_INDEX.col2}
                          value={row.col2_hotelCountIn || ''}
                          onChange={e => {
                            const v = e.target.value
                            if (v === '' || /^\d+$/.test(v))
                              updateRow(item.code, 'col2_hotelCountIn', v === '' ? 0 : parseInt(v, 10))
                          }}
                          onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); setActiveColIdx(COL_NAV_INDEX.col2); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                          onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col2)}
                          className="w-16 px-2 py-1 border border-slate-300 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none"
                        />
                      ) : (
                        <span className="text-slate-700">{row.col2_hotelCountIn || '-'}</span>
                      )
                    )}
                  </td>

                  {/* Col 3 - เคลม */}
                  <td className="px-1 py-1 text-center">
                    {isEditable('col3') ? (
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        data-row={rowIndex} data-col={COL_NAV_INDEX.col3}
                        value={row.col3_hotelClaimCount || ''}
                        onChange={e => {
                          const v = e.target.value
                          if (v === '' || /^\d+$/.test(v))
                            updateRow(item.code, 'col3_hotelClaimCount', v === '' ? 0 : parseInt(v, 10))
                        }}
                        onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); setActiveColIdx(COL_NAV_INDEX.col3); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                        onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col3)}
                        className="w-16 px-2 py-1 border border-slate-300 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col3_hotelClaimCount || '-'}</span>
                    )}
                  </td>

                  {/* Col 5 - โรงซักนับเข้า · 331: borders ย้ายไป tr · 334: hasCountInDisc group-aware */}
                  <td className={cn(
                    'px-1 py-1 text-center',
                    !isTrustCustomer && hasCountInDisc && 'bg-amber-50',
                  )}>
                    {isTrustCustomer ? (
                      // 265 — trust mode: ไม่นับเข้า แสดง "—"
                      <span className="text-slate-300" title="ลูกค้า Trust Customer — ไม่นับเข้า">—</span>
                    ) : aggMeta?.col5Aggregate ? (
                      aggMeta.isAnchor ? (
                        // Anchor: input + label "รวม" (teal when group active)
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            'text-[10px] leading-none mb-0.5 transition-colors',
                            isAggGroupActive(aggMeta.groupKey, 'col5')
                              ? 'text-[#3DD8D8] font-semibold'
                              : 'text-slate-500',
                          )}>
                            รวม
                          </div>
                          {isEditable('col5') ? (
                            <input
                              type="text" inputMode="numeric" pattern="[0-9]*"
                              data-row={rowIndex} data-col={COL_NAV_INDEX.col5}
                              value={row.col5_factoryClaimApproved || ''}
                              onChange={e => {
                                const v = e.target.value
                                if (v === '' || /^\d+$/.test(v))
                                  updateRow(item.code, 'col5_factoryClaimApproved', v === '' ? 0 : parseInt(v, 10))
                              }}
                              onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); setActiveColIdx(COL_NAV_INDEX.col5); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                              onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col5)}
                              className={cn(
                                'w-16 px-2 py-1 border rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
                                hasCountInDisc ? 'border-amber-400 bg-amber-50' : 'border-slate-300 focus:border-[#3DD8D8]',
                              )}
                            />
                          ) : (
                            <span className={cn('text-slate-700', hasCountInDisc && 'text-amber-600 font-medium')}>
                              {row.col5_factoryClaimApproved || '-'}
                              {hasCountInDisc && ' ⚠'}
                            </span>
                          )}
                        </div>
                      ) : (
                        // Non-anchor: arrow ↓ ถ้าอยู่ก่อน anchor / ↑ ถ้าอยู่หลัง
                        (() => {
                          const anchorIdx = enabledItems.findIndex(it => it.code === aggMeta.anchorCode)
                          const dir = rowIndex < anchorIdx ? '↓' : '↑'
                          const active = isAggGroupActive(aggMeta.groupKey, 'col5')
                          return (
                            <button
                              type="button"
                              onClick={() => isEditable('col5') && focusAnchorCell(aggMeta.anchorCode, COL_NAV_INDEX.col5)}
                              disabled={!isEditable('col5')}
                              title={isEditable('col5') ? 'ค่ารวมอยู่ที่ row anchor — คลิกเพื่อ focus' : 'ค่ารวมอยู่ที่ row anchor'}
                              className={cn(
                                'text-sm transition-colors disabled:cursor-default',
                                active ? 'text-[#3DD8D8]' : 'text-slate-400 hover:text-[#3DD8D8]',
                              )}
                            >
                              {dir}
                            </button>
                          )
                        })()
                      )
                    ) : isEditable('col5') ? (
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        data-row={rowIndex} data-col={COL_NAV_INDEX.col5}
                        value={row.col5_factoryClaimApproved || ''}
                        onChange={e => {
                          const v = e.target.value
                          if (v === '' || /^\d+$/.test(v))
                            updateRow(item.code, 'col5_factoryClaimApproved', v === '' ? 0 : parseInt(v, 10))
                        }}
                        onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); setActiveColIdx(COL_NAV_INDEX.col5); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                        onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col5)}
                        className={cn(
                          'w-16 px-2 py-1 border rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none',
                          hasCountInDisc ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                        )}
                      />
                    ) : (
                      <span className={cn('text-slate-700', hasCountInDisc && 'text-amber-600 font-medium')}>
                        {row.col5_factoryClaimApproved || '-'}
                        {hasCountInDisc && ' ⚠'}
                      </span>
                    )}
                  </td>

                  {/* Col 6 - โรงซักแพคส่ง */}
                  <td className="px-1 py-1 text-center">
                    {isEditable('col6') ? (
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        data-row={rowIndex} data-col={COL_NAV_INDEX.col6}
                        value={row.col6_factoryPackSend || ''}
                        onChange={e => {
                          const v = e.target.value
                          if (v === '' || /^\d+$/.test(v))
                            updateRow(item.code, 'col6_factoryPackSend', v === '' ? 0 : parseInt(v, 10))
                        }}
                        onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); setActiveColIdx(COL_NAV_INDEX.col6); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                        onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col6)}
                        className="w-16 px-2 py-1 border border-slate-300 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col6_factoryPackSend || '-'}</span>
                    )}
                  </td>

                  {/* Calculated - ค้าง(-)/คืน(+) · 333.1: group-aware (theme เดียวกับ col2/col5) */}
                  {/* 265 — trust_customer: ใช้ col6 − (col2+col3) แทน col6 − col5 */}
                  {/* 333.1 — เมื่อ col ที่ใช้คำนวณ (col5/col2) เป็น aggregate → group sum ที่ anchor */}
                  <td className="px-1 py-1 text-center">
                    {(() => {
                      // ตรวจว่าควรแสดงแบบ group หรือ per-row
                      // cross_check + col5Aggregate → group / trust + col2Aggregate → group / ที่เหลือ → per-row
                      const isAggForCarry = !!(aggMeta && (
                        (!isTrustCustomer && aggMeta.col5Aggregate) ||
                        (isTrustCustomer && aggMeta.col2Aggregate)
                      ))
                      if (isAggForCarry && aggMeta) {
                        if (aggMeta.isAnchor) {
                          // Anchor: group net (sum col6 ทั้งกลุ่ม − baseline ของกลุ่ม)
                          const gs = groupSums[aggMeta.groupKey]
                          const val = gs ? gs.col6 - gs.baseline : 0
                          if (val === 0) return <span className="text-slate-400">-</span>
                          return (
                            <span className={cn(val < 0 ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium')}>
                              {val > 0 ? `+${val}` : val}
                            </span>
                          )
                        } else {
                          // Non-anchor: ลูกศรชี้ไป anchor (theme เดียวกับ col2/col5)
                          const anchorIdx = enabledItems.findIndex(it => it.code === aggMeta.anchorCode)
                          const dir = rowIndex < anchorIdx ? '↓' : '↑'
                          return <span className="text-slate-400 text-sm">{dir}</span>
                        }
                      }
                      // Default: per-row diff (เดิม)
                      const baseline = isTrustCustomer
                        ? (row.col2_hotelCountIn + row.col3_hotelClaimCount)
                        : row.col5_factoryClaimApproved
                      const val = (row.col6_factoryPackSend || 0) - baseline
                      if (val === 0) return <span className="text-slate-400">-</span>
                      return (
                        <span className={cn(val < 0 ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium')}>
                          {val > 0 ? `+${val}` : val}
                        </span>
                      )
                    })()}
                  </td>

                  {/* Note - หมายเหตุ */}
                  <td className="px-1 py-1">
                    {isEditable('note') ? (
                      <input
                        type="text"
                        data-row={rowIndex} data-col={COL_NAV_INDEX.note}
                        value={row.note}
                        onChange={e => updateRow(item.code, 'note', e.target.value)}
                        onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); setActiveColIdx(COL_NAV_INDEX.note); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                        onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.note)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none"
                        placeholder="..."
                      />
                    ) : (
                      <span className="text-slate-500 text-xs">{row.note || '-'}</span>
                    )}
                  </td>

                  {/* Col 4 - ลูกค้านับกลับ — 268: ยัง editable ใน trust mode */}
                  <td className={cn('px-1 py-1 text-center', hasCountBackDisc && 'bg-red-50')}>
                    <div className="flex items-center justify-center gap-1">
                      {isEditable('col4') ? (
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          data-row={rowIndex} data-col={COL_NAV_INDEX.col4}
                          value={row.col4_factoryApproved || ''}
                          onChange={e => {
                            const v = e.target.value
                            if (v === '' || /^\d+$/.test(v))
                              updateRow(item.code, 'col4_factoryApproved', v === '' ? 0 : parseInt(v, 10))
                          }}
                          onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); setActiveColIdx(COL_NAV_INDEX.col4); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                          onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col4)}
                          className={cn(
                            'w-16 px-2 py-1 border rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none',
                            hasCountBackDisc ? 'border-red-400 bg-red-50' : 'border-slate-300'
                          )}
                        />
                      ) : (
                        <span className={cn('text-slate-700', hasCountBackDisc && 'text-red-600 font-medium')}>
                          {row.col4_factoryApproved || '-'}
                          {hasCountBackDisc && ' ⚠'}
                        </span>
                      )}
                      {/* 70+73+74+75: ⚡ One-click sync button */}
                      {hasCountBackDisc && onApproveSync && (
                        <button type="button" onClick={() => onApproveSync(item.code)}
                          title={`ปรับ AUTO โรงซักแพคส่ง = ลูกค้านับกลับ (${row.col4_factoryApproved}) — ตรวจสอบแล้ว`}
                          className="p-0.5 rounded hover:bg-amber-100 text-amber-600 transition-colors">
                          <Zap className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* 70+73+74+75: ✓ Synced badge */}
                      {wasSynced(row) && !hasCountBackDisc && (
                        <span title={`เคย sync จาก col6=${row.originalCol6}/col4=${row.originalCol4} เมื่อ ${row.syncedAt?.slice(0, 10)}`}
                          className="text-emerald-500">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-medium text-slate-700">
              <td className="px-3 py-2" colSpan={2}>รวม</td>
              <td className="px-3 py-2 text-center">
                <span className={cn(
                  totals.col1 < 0 && 'text-red-600',
                  totals.col1 > 0 && 'text-emerald-600',
                )}>
                  {totals.col1 !== 0 ? (totals.col1 > 0 ? `+${totals.col1}` : totals.col1) : '-'}
                </span>
              </td>
              <td className="px-3 py-2 text-center">{totals.col2}</td>
              <td className="px-3 py-2 text-center">{totals.col3}</td>
              <td className="px-3 py-2 text-center">
                {/* 273: trust mode → col5 blank; cross_check → show total */}
                {isTrustCustomer ? <span className="text-slate-300">—</span> : totals.col5}
              </td>
              <td className="px-3 py-2 text-center">{totals.col6}</td>
              <td className="px-3 py-2 text-center">
                {(() => {
                  // 273: trust-aware baseline (col6 − (col2+col3) when trust, else col6 − col5)
                  const baseline = isTrustCustomer ? (totals.col2 + totals.col3) : totals.col5
                  const val = totals.col6 - baseline
                  if (val === 0) return '-'
                  return (
                    <span className={cn(val < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {val > 0 ? `+${val}` : val}
                    </span>
                  )
                })()}
              </td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-center">{totals.col4}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
