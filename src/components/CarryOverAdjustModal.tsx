'use client'

import { useState, useMemo, useEffect } from 'react'
import Modal from './Modal'
import { useStore } from '@/lib/store'
import { todayISO, cn } from '@/lib/utils'
import { CARRY_OVER_MODE_CONFIG, CARRY_OVER_REASON_CONFIG } from '@/types'
import type {
  CarryOverAdjustment, CarryOverMode, CarryOverAdjustmentType, CarryOverReasonCategory,
} from '@/types'
import { Plus, RotateCcw, Info, Package, Scale, AlertTriangle } from 'lucide-react'
import { tabularNumberNav } from '@/lib/modal-nav'
import { pushUndoAction } from '@/lib/undo-stack'
import { getGroupAnchorCode } from '@/lib/aggregate-groups'
import { buildAggregateSnapshot } from '@/lib/carry-over-logic'

/**
 * 300: Delta input cell — raw string state + auto-select + allow negative
 *   - type="text" inputMode="numeric" → รับ "-" character ได้
 *   - raw string state → keep "-" intermediate ไม่ถูก wipe (vs parseInt('-') || 0)
 *   - sync from parent (shortcut button → delta external change)
 *   - auto-select row บน first type — ลดขั้นตอน UX
 *   - blur normalize: "" / "-" → 0
 */
function DeltaInput({
  rowIndex, maxIndex, delta, isSelected, onSelectChange, onChange,
}: {
  rowIndex: number
  maxIndex: number
  delta: number
  isSelected: boolean
  onSelectChange: () => void  // toggle row selection (called on first type when unselected)
  onChange: (n: number) => void
}) {
  const [raw, setRaw] = useState(isSelected ? String(delta) : '')

  // Sync from parent: shortcut button คลิก / state reset / type changed → reflect ลง raw
  useEffect(() => {
    setRaw(isSelected ? String(delta) : '')
  }, [delta, isSelected])

  return (
    <input
      type="text"
      inputMode="numeric"
      data-cornavrow={rowIndex}
      value={raw}
      placeholder={isSelected ? '0' : '-'}
      onFocus={e => e.currentTarget.select()}
      onKeyDown={e => tabularNumberNav(e, 'data-cornavrow', rowIndex, maxIndex)}
      onChange={e => {
        const v = e.target.value
        // อนุญาตเฉพาะ: "" | "-" | "-?\d+" (กัน user paste อักษรอื่น)
        if (v !== '' && v !== '-' && !/^-?\d+$/.test(v)) return
        setRaw(v)
        // Auto-select row บน first type (เมื่อค่ายัง intermediate ก็ select ทันที)
        if (!isSelected && (v !== '' && v !== '-')) {
          onSelectChange()
        } else if (!isSelected && v === '-') {
          // typed only "-" — pre-select ด้วย (user กำลังจะใส่ negative)
          onSelectChange()
        }
        // Propagate ค่าตัวเลขที่ valid
        if (v === '' || v === '-') return
        const n = parseInt(v, 10)
        if (!isNaN(n)) {
          const clamped = Math.max(-9999, Math.min(9999, n))
          onChange(clamped)
        }
      }}
      onBlur={() => {
        // Normalize: "" / "-" → 0 (ถ้า selected) หรือ '' (ถ้า unselected)
        if (raw === '' || raw === '-') {
          if (isSelected) {
            setRaw('0')
            onChange(0)
          } else {
            setRaw('')
          }
        }
      }}
      className={cn(
        'w-full px-2 py-1 border rounded text-right focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]',
        isSelected
          ? 'border-slate-200'
          : 'border-transparent text-slate-300 bg-slate-50/40 hover:bg-slate-50',
      )}
    />
  )
}

interface Props {
  open: boolean
  onClose: () => void
  customerId: string
  customerName: string
  /** ถ้ามี = edit mode (มี history tracking) */
  editing?: CarryOverAdjustment
}

export default function CarryOverAdjustModal({ open, onClose, customerId, customerName, editing }: Props) {
  const { getCarryOver, addCarryOverAdjustment, updateCarryOverAdjustment, linenCatalog, customers, linenForms, quotations } = useStore()

  const customer = customers.find(c => c.id === customerId)

  /**
   * Resolve รายการผ้าของลูกค้า — 226.B: ตัด customer.enabledItems fallback ออก
   * Priority:
   * 1. QT accepted (primary — QT = single source of truth)
   * 2. codes จาก LF history (lookup เผื่อยังไม่มี QT แต่มีงานเก่า)
   * 3. linenCatalog ทั้งหมด (final fallback — ลูกค้าใหม่ยังไม่มี QT/LF)
   */
  const enabledItems = useMemo(() => {
    if (!customer) return []

    // Priority 1: QT accepted
    const acceptedQT = quotations.find(q => q.customerId === customer.id && q.status === 'accepted')
    if (acceptedQT && acceptedQT.items.length > 0) {
      return acceptedQT.items
        .map(qi => linenCatalog.find(c => c.code === qi.code))
        .filter((it): it is NonNullable<typeof it> => !!it)
    }

    // Priority 2: codes จาก LF history
    const lfCodes = new Set<string>()
    for (const f of linenForms) {
      if (f.customerId !== customer.id) continue
      for (const r of f.rows) lfCodes.add(r.code)
    }
    if (lfCodes.size > 0) {
      return linenCatalog.filter(it => lfCodes.has(it.code))
    }

    // Final fallback: catalog ทั้งหมด
    return linenCatalog
  }, [customer, linenCatalog, linenForms, quotations])

  // ---- State ----
  const [type, setType] = useState<CarryOverAdjustmentType>('adjust')
  const [date, setDate] = useState<string>(todayISO())
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map())
  const [referenceMode, setReferenceMode] = useState<CarryOverMode>(1)
  const [reasonCategory, setReasonCategory] = useState<CarryOverReasonCategory>('human_error')
  const [reason, setReason] = useState<string>('')
  const [showInCustomerReport, setShowInCustomerReport] = useState<boolean>(false)
  // 340.2: Redistribute mode — auto-balance anchor delta = -sum(non-anchor delta)
  //   default ON สำหรับลูกค้าที่ใช้ aggregate group (เคส 42)
  //   ปิดถ้า user ตั้งใจ "เพิ่มผ้าค้างใหม่" (ไม่ใช่ redistribute)
  const [autoBalanceAnchor, setAutoBalanceAnchor] = useState<boolean>(true)

  // Reset state when modal opens
  useEffect(() => {
    if (!open) return
    if (editing) {
      setType(editing.type)
      setDate(editing.date)
      setSelectedItems(new Map(editing.items.map(i => [i.code, i.delta || 0])))
      setReasonCategory(editing.reasonCategory)
      setReason(editing.reason)
      setShowInCustomerReport(editing.showInCustomerReport)
      setAutoBalanceAnchor(false) // edit mode: ไม่ auto-balance เพราะอาจ overwrite ค่าเดิม
    } else {
      setType('adjust')
      setDate(todayISO())
      setSelectedItems(new Map())
      setReferenceMode(1)
      setReasonCategory('human_error')
      setReason('')
      setShowInCustomerReport(false)
      setAutoBalanceAnchor(true) // new adjustment: default ON
    }
  }, [open, editing])

  // ---- Helper: current carry-over for all 4 modes ----
  // คำนวณยอด ณ "วันก่อน" date ที่เลือก (เพื่อแสดงยอดที่จะถูก apply ทับ)
  const currentCarryOver = useMemo(() => {
    const empty = { 1: {}, 2: {}, 3: {}, 4: {} } as Record<CarryOverMode, Record<string, number>>
    if (!customerId) return empty
    return {
      1: getCarryOver(customerId, date, 1),
      2: getCarryOver(customerId, date, 2),
      3: getCarryOver(customerId, date, 3),
      4: getCarryOver(customerId, date, 4),
    } as Record<CarryOverMode, Record<string, number>>
  }, [customerId, date, getCarryOver])

  // 340.2: aggregate group meta — anchor + group members per code
  const aggGroupMeta = useMemo(() => {
    const meta = new Map<string, { groupKey: string; anchorCode: string; memberCodes: string[]; isAnchor: boolean }>()
    if (!customer?.aggregateSizeGroups || customer.aggregateSizeGroups.length === 0) return meta
    for (const cfg of customer.aggregateSizeGroups) {
      const col5Agg = (cfg.col5Mode ?? 'aggregate') === 'aggregate'
      const col2Agg = cfg.col2Mode === 'aggregate'
      if (!col5Agg && !col2Agg) continue
      const groupItems = linenCatalog.filter(i => i.sizeGroup === cfg.groupKey)
      if (groupItems.length === 0) continue
      const anchorCode = getGroupAnchorCode(groupItems, cfg.anchorCode)
      const memberCodes = groupItems.map(i => i.code)
      for (const code of memberCodes) {
        meta.set(code, { groupKey: cfg.groupKey, anchorCode, memberCodes, isAnchor: code === anchorCode })
      }
    }
    return meta
  }, [customer, linenCatalog])

  const hasAggregateGroups = aggGroupMeta.size > 0

  // 340.2: Derived anchor delta จาก non-anchor sums (auto-balance)
  //   ตัวอย่าง: user ใส่ 3.5ft=-1, 6ft=-1 → derived 5ft (anchor) = +2
  //   เพื่อให้ group sum ก่อน/หลัง adj คงที่ (เป็นการ "redistribute" ไม่ใช่ "add")
  const derivedAnchorDeltas = useMemo(() => {
    const m = new Map<string, number>()
    if (!autoBalanceAnchor || type !== 'adjust') return m
    const groupSum = new Map<string, { anchor: string; sum: number }>()
    for (const [code, delta] of selectedItems.entries()) {
      const meta = aggGroupMeta.get(code)
      if (!meta || meta.isAnchor) continue
      const existing = groupSum.get(meta.groupKey) ?? { anchor: meta.anchorCode, sum: 0 }
      existing.sum += delta
      groupSum.set(meta.groupKey, existing)
    }
    for (const { anchor, sum } of groupSum.values()) {
      if (sum !== 0) m.set(anchor, -sum)
    }
    return m
  }, [selectedItems, autoBalanceAnchor, type, aggGroupMeta])

  /** Item is effectively selected (user-selected OR auto-balanced anchor) */
  const isEffectivelySelected = (code: string): boolean => {
    if (selectedItems.has(code)) return true
    if (autoBalanceAnchor && derivedAnchorDeltas.has(code)) return true
    return false
  }

  /** 340.2: Group sum preview — แสดง group total ก่อน vs หลัง adj
   *  ช่วย user ตรวจว่า "redistribute" หรือ "add" — ใช้ในการตัดสินใจ
   */
  const groupSumPreview = useMemo(() => {
    type GroupPreview = {
      groupKey: string; anchorCode: string; groupName: string
      beforeSum: number; afterSum: number; userImbalance: number
      memberDeltas: { code: string; delta: number; isAnchor: boolean; isDerived: boolean }[]
    }
    const previews: GroupPreview[] = []
    if (type !== 'adjust' || !hasAggregateGroups) return previews
    const groups = new Map<string, GroupPreview>()
    for (const [, meta] of aggGroupMeta) {
      if (!groups.has(meta.groupKey)) {
        const item = linenCatalog.find(i => i.code === meta.anchorCode)
        groups.set(meta.groupKey, {
          groupKey: meta.groupKey, anchorCode: meta.anchorCode,
          groupName: item?.sizeGroup || meta.groupKey,
          beforeSum: 0, afterSum: 0, userImbalance: 0,
          memberDeltas: [],
        })
      }
    }
    for (const [code, meta] of aggGroupMeta) {
      const g = groups.get(meta.groupKey)!
      const before = currentCarryOver[referenceMode]?.[code] || 0
      g.beforeSum += before
      const isDerived = autoBalanceAnchor && derivedAnchorDeltas.has(code)
      const delta = isDerived ? derivedAnchorDeltas.get(code)! : (selectedItems.get(code) ?? 0)
      g.afterSum += before + delta
      if (isEffectivelySelected(code) || delta !== 0) {
        g.memberDeltas.push({ code, delta, isAnchor: meta.isAnchor, isDerived })
      }
    }
    for (const g of groups.values()) {
      g.userImbalance = g.afterSum - g.beforeSum
      if (g.memberDeltas.length > 0) previews.push(g)
    }
    return previews
  }, [aggGroupMeta, currentCarryOver, referenceMode, selectedItems, autoBalanceAnchor, derivedAnchorDeltas, type, hasAggregateGroups, linenCatalog])

  // ---- Item handlers ----
  const toggleItem = (code: string) => {
    setSelectedItems(prev => {
      const next = new Map(prev)
      if (next.has(code)) next.delete(code)
      else next.set(code, 0)
      return next
    })
  }

  const setItemDelta = (code: string, delta: number) => {
    setSelectedItems(prev => {
      const next = new Map(prev)
      if (next.has(code)) next.set(code, delta)
      return next
    })
  }

  const allSelected = enabledItems.length > 0 && enabledItems.every(it => selectedItems.has(it.code))

  const toggleAll = () => {
    setSelectedItems(prev => {
      if (allSelected) return new Map()
      return new Map(enabledItems.map(it => [it.code, prev.get(it.code) || 0]))
    })
  }

  // ---- Save ----
  const canSave = selectedItems.size > 0 && reason.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    // 340.2: Merge auto-balanced anchor delta into items (ถ้า autoBalanceAnchor ON)
    const itemMap = new Map<string, number>()
    for (const [code, delta] of selectedItems.entries()) {
      itemMap.set(code, type === 'adjust' ? delta : 0)
    }
    const usedAutoBalance = autoBalanceAnchor && type === 'adjust' && derivedAnchorDeltas.size > 0
    if (autoBalanceAnchor && type === 'adjust') {
      for (const [anchorCode, derivedDelta] of derivedAnchorDeltas) {
        itemMap.set(anchorCode, derivedDelta) // override user input ถ้ามี
      }
    }
    const items = [...itemMap.entries()].map(([code, delta]) => ({ code, delta }))
    // 340.3: Capture aggregate snapshot (กัน drift เมื่อ customer toggle config ภายหลัง)
    const snapshot = hasAggregateGroups
      ? buildAggregateSnapshot(customer?.aggregateSizeGroups)
      : undefined
    const typeLabel = type === 'reset' ? 'Reset' : 'Adjust'
    if (editing) {
      // 296: snapshot oldData ก่อน update → push undo
      const oldData = { ...editing }
      const changeNote = `แก้ไข ${typeLabel}: ${items.length} รายการ`
      updateCarryOverAdjustment(editing.id, {
        type, date, items, reasonCategory, reason, showInCustomerReport,
        aggregateSnapshot: snapshot,
        autoBalancedAnchor: usedAutoBalance,
      }, changeNote)
      pushUndoAction({
        type: 'carry_over',
        description: `แก้ไขการปรับยอด ${typeLabel} (${items.length} รายการ) — ${customerName}`,
        changes: [{ table: 'carry_over_adjustments', id: editing.id, op: 'update', oldData }],
      })
    } else {
      const newAdj = addCarryOverAdjustment({
        customerId, date, type, items, reasonCategory, reason, showInCustomerReport,
        aggregateSnapshot: snapshot,
        autoBalancedAnchor: usedAutoBalance,
      })
      pushUndoAction({
        type: 'carry_over',
        description: `เพิ่ม ${typeLabel} (${items.length} รายการ) — ${customerName}`,
        changes: [{ table: 'carry_over_adjustments', id: newAdj.id, op: 'insert', newData: { id: newAdj.id } }],
      })
    }
    onClose()
  }

  // ---- Display helpers ----
  const fmt = (n: number) => n > 0 ? `+${n}` : `${n}`
  const colorOf = (n: number) => n < 0 ? 'text-red-600' : n > 0 ? 'text-emerald-600' : 'text-slate-400'

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'แก้ไขการปรับยอด' : 'ปรับยอดผ้าค้าง/คืน'} size="xl" closeLabel="cancel">
      <div className="space-y-4">
        {/* Customer + Date */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-xs text-slate-500">ลูกค้า</p>
            <p className="font-semibold text-slate-800">{customerName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">วันที่ apply</p>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
          </div>
        </div>

        {/* Type toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setType('adjust')}
            className={cn('px-4 py-3 rounded-lg border-2 transition-all flex items-center gap-3 text-left',
              type === 'adjust' ? 'border-[#3DD8D8] bg-[#3DD8D8]/10' : 'border-slate-200 hover:border-slate-300')}>
            <Plus className={cn('w-5 h-5 flex-shrink-0', type === 'adjust' ? 'text-[#1B3A5C]' : 'text-slate-400')} />
            <div>
              <div className="font-semibold text-sm text-slate-800">Adjust (ปรับยอด)</div>
              <div className="text-[10px] text-slate-500">ปรับยอด +/− apply ทุกเคสเท่ากัน</div>
            </div>
          </button>
          <button onClick={() => setType('reset')}
            className={cn('px-4 py-3 rounded-lg border-2 transition-all flex items-center gap-3 text-left',
              type === 'reset' ? 'border-[#3DD8D8] bg-[#3DD8D8]/10' : 'border-slate-200 hover:border-slate-300')}>
            <RotateCcw className={cn('w-5 h-5 flex-shrink-0', type === 'reset' ? 'text-[#1B3A5C]' : 'text-slate-400')} />
            <div>
              <div className="font-semibold text-sm text-slate-800">Reset (เคลียร์ยอด)</div>
              <div className="text-[10px] text-slate-500">overwrite ทุกเคสเป็น 0 (เริ่มใหม่)</div>
            </div>
          </button>
        </div>

        {/* Helper info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-xs">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-blue-800">
            {type === 'adjust'
              ? 'Adjust: ใส่ delta สำหรับแต่ละรายการ → apply กับทุกเคส (1-4) เท่ากัน → ใช้ "ปุ่มลัด" auto-fill delta ที่ทำให้เคสอ้างอิงเป็น 0'
              : 'Reset: เลือกรายการที่ต้องการเคลียร์ → ทุกเคส (1-4) จะเป็น 0 ตั้งแต่วันที่นี้ → ใช้เมื่อ "เริ่มต้นใหม่"'}
          </div>
        </div>

        {/* Reference mode (for Adjust shortcut) */}
        {type === 'adjust' && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-600 font-medium">เคสอ้างอิง (สำหรับปุ่มลัด):</span>
            <select value={referenceMode} onChange={e => setReferenceMode(Number(e.target.value) as CarryOverMode)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]">
              {([1, 2, 3, 4] as CarryOverMode[]).map(m => (
                <option key={m} value={m}>{CARRY_OVER_MODE_CONFIG[m].short}: {CARRY_OVER_MODE_CONFIG[m].formula}</option>
              ))}
            </select>
            <span className="text-slate-400">{CARRY_OVER_MODE_CONFIG[referenceMode].description}</span>
          </div>
        )}

        {/* 340.2: Aggregate group section — เฉพาะลูกค้าที่ใช้ aggregate */}
        {hasAggregateGroups && type === 'adjust' && (
          <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2 flex-1">
                <Package className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-indigo-900">ลูกค้าใช้ aggregate group (รวมไซส์)</p>
                  <p className="text-[11px] text-indigo-700 mt-0.5 leading-snug">
                    ใส่ delta ที่ size ที่ทราบจริง → ระบบ <strong>auto-balance</strong> anchor เพื่อ keep group sum
                    คงที่ (redistribute pattern จากเคส 42)
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                <input type="checkbox" checked={autoBalanceAnchor}
                  onChange={e => setAutoBalanceAnchor(e.target.checked)}
                  className="rounded" />
                <span className="text-xs font-medium text-indigo-900 flex items-center gap-1">
                  <Scale className="w-3 h-3" /> Auto-balance
                </span>
              </label>
            </div>

            {groupSumPreview.length > 0 && (
              <div className="space-y-1.5">
                {groupSumPreview.map(g => {
                  const drift = g.afterSum - g.beforeSum
                  return (
                    <div key={g.groupKey} className="bg-white rounded-md border border-indigo-200 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-slate-800">{g.groupName}</span>
                        <span className="text-[10px] text-slate-500">
                          group sum (เคสอ้างอิง {CARRY_OVER_MODE_CONFIG[referenceMode].short}):
                          <code className="mx-1 px-1 rounded bg-slate-100">{g.beforeSum > 0 ? `+${g.beforeSum}` : g.beforeSum}</code>
                          → <code className={cn(
                            'mx-1 px-1 rounded',
                            drift === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                          )}>{g.afterSum > 0 ? `+${g.afterSum}` : g.afterSum}</code>
                          {drift === 0
                            ? <span className="text-emerald-600">✓ consistent</span>
                            : <span className="text-amber-700 font-medium">⚠ drift {drift > 0 ? '+' : ''}{drift}</span>}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.memberDeltas.map(md => {
                          const item = linenCatalog.find(i => i.code === md.code)
                          return (
                            <span key={md.code} className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border',
                              md.isAnchor
                                ? (md.isDerived
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-indigo-100 text-indigo-800 border-indigo-300')
                                : 'bg-slate-50 text-slate-700 border-slate-200',
                            )}>
                              {md.isAnchor && <span title="anchor">⚓</span>}
                              {md.isDerived && <span title="auto-balanced">⚖</span>}
                              {md.code} ({item?.name || md.code}): {md.delta > 0 ? '+' : ''}{md.delta}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {!autoBalanceAnchor && groupSumPreview.some(g => g.afterSum - g.beforeSum !== 0) && (
                  <div className="bg-amber-50 border border-amber-300 rounded-md px-3 py-1.5 text-[11px] text-amber-800 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      auto-balance ปิดอยู่ → group sum กำลังเปลี่ยน (ตีความว่า &quot;เพิ่ม/ลดผ้าค้างใหม่&quot;)
                      ถ้าตั้งใจแค่ &quot;กระจาย&quot; (redistribute) → ติ๊ก auto-balance
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Toggle all */}
        <div className="flex items-center justify-between">
          <button onClick={toggleAll}
            className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium">
            {allSelected ? '✗ ยกเลิกเลือกทั้งหมด' : '☑ เลือกทุกรายการ'}
          </button>
          <span className="text-xs text-slate-500">
            {/* 340.2: นับ effective items (รวม anchor ที่ auto-balance) */}
            {Math.max(selectedItems.size, [...selectedItems.keys(), ...derivedAnchorDeltas.keys()].filter((v, i, a) => a.indexOf(v) === i).length)}/{enabledItems.length} รายการที่เลือก
            {derivedAnchorDeltas.size > 0 && (
              <span className="ml-1 text-indigo-600">(+{derivedAnchorDeltas.size} auto-balance)</span>
            )}
          </span>
        </div>

        {/* Items list */}
        <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-[40vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-center px-2 py-2 w-8"></th>
                <th className="text-left px-3 py-2">รายการ</th>
                <th className="text-right px-2 py-2 w-14" title={CARRY_OVER_MODE_CONFIG[1].description}>เคส 1</th>
                <th className="text-right px-2 py-2 w-14" title={CARRY_OVER_MODE_CONFIG[2].description}>เคส 2</th>
                <th className="text-right px-2 py-2 w-14" title={CARRY_OVER_MODE_CONFIG[3].description}>เคส 3</th>
                <th className="text-right px-2 py-2 w-14" title={CARRY_OVER_MODE_CONFIG[4].description}>เคส 4</th>
                {type === 'adjust' && <>
                  <th className="text-right px-2 py-2 w-20">Delta</th>
                  <th className="text-right px-2 py-2 w-24">ปุ่มลัด</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {enabledItems.map((item, rowIndex) => {
                const v1 = currentCarryOver[1][item.code] || 0
                const v2 = currentCarryOver[2][item.code] || 0
                const v3 = currentCarryOver[3][item.code] || 0
                const v4 = currentCarryOver[4][item.code] || 0
                const aggMeta = aggGroupMeta.get(item.code)
                // 340.2: auto-balance anchor — show derived delta, lock manual input
                const isAutoBalanced = autoBalanceAnchor && type === 'adjust' && derivedAnchorDeltas.has(item.code)
                const isSelected = selectedItems.has(item.code) || isAutoBalanced
                const userDelta = selectedItems.get(item.code) || 0
                const displayDelta = isAutoBalanced ? derivedAnchorDeltas.get(item.code)! : userDelta
                const refValue = currentCarryOver[referenceMode][item.code] || 0
                const shortcutDelta = -refValue
                return (
                  <tr key={item.code} className={cn(
                    'border-t border-slate-100',
                    isSelected && (isAutoBalanced ? 'bg-emerald-50/40' : 'bg-[#3DD8D8]/5'),
                    aggMeta && 'border-l-2 border-l-indigo-200',
                  )}>
                    <td className="text-center px-2 py-1.5">
                      <input type="checkbox" checked={isSelected}
                        onChange={() => toggleItem(item.code)}
                        disabled={isAutoBalanced}
                        title={isAutoBalanced ? 'Auto-balanced anchor — ปิด auto-balance เพื่อ edit เอง' : ''}
                        className="rounded disabled:opacity-50" />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-slate-400 mr-1.5">{item.code}</span>
                      <span className="text-slate-700">{item.name}</span>
                      {aggMeta?.isAnchor && (
                        <span className="ml-1.5 text-[10px] text-indigo-700 font-medium" title="Anchor ของ aggregate group">⚓ anchor</span>
                      )}
                      {aggMeta && !aggMeta.isAnchor && (
                        <span className="ml-1.5 text-[10px] text-slate-400" title={`รวมที่ ${aggMeta.anchorCode}`}>↑ {aggMeta.anchorCode}</span>
                      )}
                    </td>
                    <td className={cn('text-right px-2 py-1.5 font-mono', colorOf(v1))}>{fmt(v1)}</td>
                    <td className={cn('text-right px-2 py-1.5 font-mono', colorOf(v2))}>{fmt(v2)}</td>
                    <td className={cn('text-right px-2 py-1.5 font-mono', colorOf(v3))}>{fmt(v3)}</td>
                    <td className={cn('text-right px-2 py-1.5 font-mono', colorOf(v4))}>{fmt(v4)}</td>
                    {type === 'adjust' && <>
                      <td className="px-2 py-1.5">
                        {isAutoBalanced ? (
                          <div className="flex items-center justify-end gap-1" title="Auto-balanced (จาก non-anchor delta)">
                            <Scale className="w-3 h-3 text-emerald-600" />
                            <span className={cn('font-mono text-sm', colorOf(displayDelta))}>{fmt(displayDelta)}</span>
                          </div>
                        ) : (
                          <DeltaInput
                            rowIndex={rowIndex}
                            maxIndex={enabledItems.length - 1}
                            delta={displayDelta}
                            isSelected={isSelected}
                            onSelectChange={() => toggleItem(item.code)}
                            onChange={n => setItemDelta(item.code, n)}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {!isAutoBalanced && isSelected && shortcutDelta !== 0 && (
                          <button onClick={() => setItemDelta(item.code, shortcutDelta)}
                            title={`Reset เคส ${referenceMode}: ${fmt(shortcutDelta)}`}
                            className="px-2 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded hover:bg-amber-200 font-mono">
                            {fmt(shortcutDelta)}
                          </button>
                        )}
                      </td>
                    </>}
                  </tr>
                )
              })}
              {enabledItems.length === 0 && (
                <tr>
                  <td colSpan={type === 'adjust' ? 8 : 6} className="text-center py-4 text-slate-400">
                    ไม่มีรายการผ้าที่เปิดใช้งาน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Reason section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">หมวดเหตุผล</label>
            <select value={reasonCategory} onChange={e => setReasonCategory(e.target.value as CarryOverReasonCategory)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]">
              {Object.entries(CARRY_OVER_REASON_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showInCustomerReport}
                onChange={e => setShowInCustomerReport(e.target.checked)} className="rounded" />
              <span className="text-xs text-slate-700">แสดงในรายงานที่ส่งให้ลูกค้า</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">เหตุผลละเอียด <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder="เช่น โรงซักชดเชยผ้า B/T 50 ผืนให้ลูกค้า เซ็นรับเรียบร้อย"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>

        {/* History (edit mode) */}
        {editing && editing.history.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-700 mb-2">ประวัติการแก้ไข</p>
            <div className="space-y-1 text-xs">
              {editing.history.map((h, i) => (
                <div key={i} className="text-slate-600">
                  <span className="font-mono text-slate-400">{h.editedAt.slice(0, 16).replace('T', ' ')}</span>
                  {' '}โดย <span className="font-medium">{h.editedBy}</span>: {h.changes}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">ยกเลิก</button>
          <button onClick={handleSave} disabled={!canSave}
            className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:bg-slate-100 disabled:text-slate-400 font-semibold">
            {editing ? 'บันทึกการแก้ไข' : (type === 'reset' ? 'Reset ยอด' : 'บันทึก Adjust')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
