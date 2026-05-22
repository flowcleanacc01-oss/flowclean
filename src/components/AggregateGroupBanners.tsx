'use client'

/**
 * 317 Phase 2 — Aggregate Group Banner (LF Input)
 *
 * Render banner เหนือ LF grid สำหรับลูกค้าที่ opt-in size groups
 * แต่ละ banner = 1 group มี:
 *   - Group title + items list (code + ชื่อ)
 *   - Input col2 (ถ้า col2Mode=aggregate)
 *   - Input col5 (ถ้า col5Mode=aggregate)
 *   - Anchor row indicator (median sortOrder)
 *
 * Option X: ค่า aggregate save ที่ row anchor (median) — ตรงกับ workflow paper
 */

import { useMemo } from 'react'
import { Boxes, Anchor } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getOptInGroupsForCustomer,
  sumGroupField,
  applyAggregateTotal,
} from '@/lib/aggregate-groups'
import type { Customer, LinenItemDef, LinenFormRow, QuotationItem } from '@/types'

interface Props {
  customer: Customer
  catalog: LinenItemDef[]
  rows: LinenFormRow[]
  onChange: (rows: LinenFormRow[]) => void
  /** Codes ที่ LF นี้ใช้ — จาก QT (ดูว่า group ไหน relevant) */
  qtItems?: QuotationItem[]
  itemCodes?: string[]
  /** ⛔ Read-only mode (sorting/process status) */
  readOnly?: boolean
  /** Visible editable cols ใน LF status ปัจจุบัน — ตัด col input ที่ status ไม่อนุญาต */
  editableCols?: ('col2' | 'col5')[]
}

export default function AggregateGroupBanners({
  customer, catalog, rows, onChange,
  qtItems, itemCodes,
  readOnly = false,
  editableCols = ['col2', 'col5'],
}: Props) {
  const relevantCodes = useMemo(() => {
    if (qtItems) return qtItems.map(q => q.code)
    return itemCodes
  }, [qtItems, itemCodes])

  const groups = useMemo(
    () => getOptInGroupsForCustomer(customer, catalog, relevantCodes),
    [customer, catalog, relevantCodes],
  )

  if (groups.length === 0) return null

  const updateGroupCol2 = (groupItems: LinenItemDef[], anchorCode: string, total: number) => {
    onChange(applyAggregateTotal(rows, groupItems, anchorCode, 'col2_hotelCountIn', total))
  }
  const updateGroupCol5 = (groupItems: LinenItemDef[], anchorCode: string, total: number) => {
    onChange(applyAggregateTotal(rows, groupItems, anchorCode, 'col5_factoryClaimApproved', total))
  }

  return (
    <div className="mb-3 space-y-2">
      {groups.map(grp => {
        const aggCol2 = grp.config.col2Mode === 'aggregate'
        const aggCol5 = (grp.config.col5Mode ?? 'aggregate') === 'aggregate'
        if (!aggCol2 && !aggCol5) return null  // ทั้งคู่ per_row → ไม่ต้องแสดง banner

        const col2Total = sumGroupField(rows, grp.items, 'col2_hotelCountIn')
        const col5Total = sumGroupField(rows, grp.items, 'col5_factoryClaimApproved')
        const anchorItem = grp.items.find(i => i.code === grp.anchorCode)

        const showCol2 = aggCol2 && editableCols.includes('col2')
        const showCol5 = aggCol5 && editableCols.includes('col5')

        return (
          <div
            key={grp.groupKey}
            className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"
          >
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Boxes className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span className="font-mono font-bold text-indigo-700 text-sm">{grp.groupKey}</span>
              <span className="text-[10px] text-slate-500">รวมไซส์</span>
              <div className="flex flex-wrap gap-1 text-[10px]">
                {grp.items.map(it => (
                  <span
                    key={it.code}
                    className={cn(
                      'px-1.5 py-0.5 rounded font-mono border',
                      it.code === grp.anchorCode
                        ? 'bg-indigo-200 border-indigo-400 text-indigo-900 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600',
                    )}
                    title={it.code === grp.anchorCode ? `${it.name} — anchor (ที่เก็บยอดรวม)` : it.name}
                  >
                    {it.code === grp.anchorCode && <Anchor className="w-2 h-2 inline mr-0.5" />}
                    {it.code}
                  </span>
                ))}
              </div>
            </div>

            {/* Inputs row */}
            {(showCol2 || showCol5) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {showCol2 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 min-w-[110px] flex items-center gap-1">
                      🧺 <span>ลูกค้านับส่งซัก (รวม)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={col2Total || ''}
                      onChange={e => {
                        const v = e.target.value.replace(/[^\d]/g, '')
                        updateGroupCol2(grp.items, grp.anchorCode, v === '' ? 0 : parseInt(v, 10))
                      }}
                      onFocus={e => e.currentTarget.select()}
                      disabled={readOnly}
                      placeholder="0"
                      className="flex-1 px-2 py-1 border border-indigo-300 rounded text-sm font-mono text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
                    />
                  </div>
                )}
                {showCol5 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 min-w-[110px] flex items-center gap-1">
                      🧺 <span>โรงซักนับเข้า (รวม)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={col5Total || ''}
                      onChange={e => {
                        const v = e.target.value.replace(/[^\d]/g, '')
                        updateGroupCol5(grp.items, grp.anchorCode, v === '' ? 0 : parseInt(v, 10))
                      }}
                      onFocus={e => e.currentTarget.select()}
                      disabled={readOnly}
                      placeholder="0"
                      className="flex-1 px-2 py-1 border border-indigo-300 rounded text-sm font-mono text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-slate-500">
                {/* col2 + col5 ตั้ง aggregate แต่ status ปัจจุบันไม่อนุญาตให้แก้ใน LF — แสดงเป็น read-only ใน grid */}
                สถานะปัจจุบันไม่อนุญาตให้แก้ฟิลด์ที่ตั้ง aggregate · ดูค่าใน row anchor "{anchorItem?.name}"
              </div>
            )}

            <div className="text-[10px] text-slate-500 mt-1 leading-tight">
              💡 ระบบใส่ยอดรวมที่ <strong>row anchor</strong> ({anchorItem?.name || grp.anchorCode}) · ส่วน rows อื่นใน group = 0
              {grp.config.col2Mode === 'per_row' && ' · col2 ยังกรอกแยกใน table'}
              {(grp.config.col5Mode ?? 'aggregate') === 'per_row' && ' · col5 ยังกรอกแยกใน table'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
