'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2, Zap, Check } from 'lucide-react'
import type { LinenFormRow, Customer, LinenItemDef, LinenFormStatus, QuotationItem } from '@/types'
import { cn } from '@/lib/utils'
import { wasSynced } from '@/lib/sync-discrepancy'
import { resolveDisplayName } from '@/lib/facet-generators'

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
}: LinenFormGridProps) {
  // ถ้ามี qtItems → ใช้ลำดับ + ชื่อจาก QT, fallback ไป catalog
  // 213.2 Phase 1.2 — apply customer.itemNicknames เป็น display alias (override ชื่อ)
  const enabledItems: LinenItemDef[] = qtItems
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
        .filter(item => itemCodes ? itemCodes.includes(item.code) : customer.enabledItems.includes(item.code))
        .map(item => ({
          ...item,
          name: resolveDisplayName(item.code, item.name, customer.itemNicknames),
        }))

  const [localRows, setLocalRows] = useState<LinenFormRow[]>(rows)
  const [activeRowIdx, setActiveRowIdx] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

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

    // Enter (58): jump to first editable cell of next row
    if (e.key === 'Enter') {
      const nextRowInputs = Array.from(
        container.querySelectorAll<HTMLInputElement>(`input[data-row="${rowIndex + 1}"]`)
      ).sort((a, b) => Number(a.dataset.col) - Number(b.dataset.col))
      const first = nextRowInputs[0]
      if (first) {
        e.preventDefault()
        first.focus()
        first.select()
        setActiveRowIdx(rowIndex + 1)
        const tr = first.closest('tr')
        if (tr) scrollCellVisible(tr)
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
      const target = container.querySelector<HTMLInputElement>(
        `input[data-row="${rowIndex + dRow}"][data-col="${colIndex}"]`
      )
      if (target) {
        e.preventDefault()
        target.focus()
        target.select()
        setActiveRowIdx(rowIndex + dRow)
        const tr = target.closest('tr')
        if (tr) scrollCellVisible(tr)
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

  const isEditable = (colKey: string) => !readOnly && editableColumns.includes(colKey as typeof editableColumns[number])

  const hasCarryOver = Object.keys(carryOver).some(k => carryOver[k] !== 0)

  const totals = {
    col1: 0, col2: 0, col3: 0, col4: 0, col5: 0, col6: 0,
  }
  for (const item of enabledItems) {
    const row = getRow(item.code)
    const co = carryOver[item.code] || 0
    totals.col1 += co
    totals.col2 += row.col2_hotelCountIn
    totals.col3 += row.col3_hotelClaimCount
    totals.col4 += row.col4_factoryApproved
    totals.col5 += row.col5_factoryClaimApproved
    totals.col6 += (row.col6_factoryPackSend || 0)
  }

  return (
    <div ref={gridRef}>
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
              const hasCountInDisc = row.col5_factoryClaimApproved > 0 && row.col5_factoryClaimApproved !== expectedCountIn
              const packSend = row.col6_factoryPackSend || 0
              const hasCountBackDisc = (!formStatus || ['delivered', 'confirmed'].includes(formStatus)) &&
                row.col4_factoryApproved > 0 && row.col4_factoryApproved !== packSend

              return (
                <tr key={item.code} className={cn(
                  'border-b border-slate-100 transition-colors',
                  activeRowIdx === rowIndex ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50'
                )}>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{item.code}</td>
                  <td className={cn('px-3 py-1.5', activeRowIdx === rowIndex ? 'text-[#1B3A5C] font-semibold' : 'text-slate-700')}>{item.name}</td>

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

                  {/* Col 2 - ลูกค้านับส่ง */}
                  <td className="px-1 py-1 text-center">
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
                        onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                        onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col2)}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col2_hotelCountIn || '-'}</span>
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
                        onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                        onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col3)}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col3_hotelClaimCount || '-'}</span>
                    )}
                  </td>

                  {/* Col 5 - โรงซักนับเข้า */}
                  <td className={cn('px-1 py-1 text-center', hasCountInDisc && 'bg-amber-50')}>
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
                        onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                        onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col5)}
                        className={cn(
                          'w-16 px-2 py-1 border rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
                          hasCountInDisc ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
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
                        onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                        onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col6)}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col6_factoryPackSend || '-'}</span>
                    )}
                  </td>

                  {/* Calculated - ค้าง(-)/คืน(+) */}
                  <td className="px-1 py-1 text-center">
                    {(() => {
                      const val = (row.col6_factoryPackSend || 0) - row.col5_factoryClaimApproved
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
                        onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                        onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.note)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                        placeholder="..."
                      />
                    ) : (
                      <span className="text-slate-500 text-xs">{row.note || '-'}</span>
                    )}
                  </td>

                  {/* Col 4 - ลูกค้านับกลับ */}
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
                          onFocus={e => { e.currentTarget.select(); setActiveRowIdx(rowIndex); const tr = e.currentTarget.closest('tr'); if (tr) scrollCellVisible(tr) }}
                          onKeyDown={e => navigate(e, rowIndex, COL_NAV_INDEX.col4)}
                          className={cn(
                            'w-16 px-2 py-1 border rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
                            hasCountBackDisc ? 'border-red-400 bg-red-50' : 'border-slate-200'
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
              <td className="px-3 py-2 text-center">{totals.col5}</td>
              <td className="px-3 py-2 text-center">{totals.col6}</td>
              <td className="px-3 py-2 text-center">
                {(() => {
                  const val = totals.col6 - totals.col5
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
