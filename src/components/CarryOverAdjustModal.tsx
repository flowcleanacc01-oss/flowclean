'use client'

import { useState, useMemo, useEffect } from 'react'
import Modal from './Modal'
import { useStore } from '@/lib/store'
import { todayISO, cn } from '@/lib/utils'
import { CARRY_OVER_MODE_CONFIG, CARRY_OVER_REASON_CONFIG } from '@/types'
import type {
  CarryOverAdjustment, CarryOverMode, CarryOverAdjustmentType, CarryOverReasonCategory,
} from '@/types'
import { Plus, RotateCcw, Info } from 'lucide-react'

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
   * Resolve รายการผ้าของลูกค้า — ใช้ priority เดียวกับ LinenFormGrid:
   * 1. QT accepted (ถ้ามี)
   * 2. customer.enabledItems (legacy)
   * 3. codes ที่ปรากฏใน LF history ของลูกค้านี้ (fallback กรณีไม่มี QT/enabledItems)
   * 4. linenCatalog ทั้งหมด (สุดท้าย — กรณีลูกค้าใหม่)
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

    // Priority 2: customer.enabledItems
    if (customer.enabledItems && customer.enabledItems.length > 0) {
      return linenCatalog.filter(it => customer.enabledItems.includes(it.code))
    }

    // Priority 3: codes จาก LF history
    const lfCodes = new Set<string>()
    for (const f of linenForms) {
      if (f.customerId !== customer.id) continue
      for (const r of f.rows) lfCodes.add(r.code)
    }
    if (lfCodes.size > 0) {
      return linenCatalog.filter(it => lfCodes.has(it.code))
    }

    // Fallback: catalog ทั้งหมด
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
    } else {
      setType('adjust')
      setDate(todayISO())
      setSelectedItems(new Map())
      setReferenceMode(1)
      setReasonCategory('human_error')
      setReason('')
      setShowInCustomerReport(false)
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
    const items = [...selectedItems.entries()].map(([code, delta]) => ({
      code,
      delta: type === 'adjust' ? delta : 0,
    }))
    if (editing) {
      const changeNote = `แก้ไข ${type === 'reset' ? 'Reset' : 'Adjust'}: ${items.length} รายการ`
      updateCarryOverAdjustment(editing.id, {
        type, date, items, reasonCategory, reason, showInCustomerReport,
      }, changeNote)
    } else {
      addCarryOverAdjustment({
        customerId, date, type, items, reasonCategory, reason, showInCustomerReport,
      })
    }
    onClose()
  }

  // ---- Display helpers ----
  const fmt = (n: number) => n > 0 ? `+${n}` : `${n}`
  const colorOf = (n: number) => n < 0 ? 'text-red-600' : n > 0 ? 'text-emerald-600' : 'text-slate-400'

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'แก้ไขการปรับยอด' : 'ปรับยอดผ้าค้าง/คืน'} size="xl">
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

        {/* Toggle all */}
        <div className="flex items-center justify-between">
          <button onClick={toggleAll}
            className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium">
            {allSelected ? '✗ ยกเลิกเลือกทั้งหมด' : '☑ เลือกทุกรายการ'}
          </button>
          <span className="text-xs text-slate-500">{selectedItems.size}/{enabledItems.length} รายการที่เลือก</span>
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
              {enabledItems.map(item => {
                const v1 = currentCarryOver[1][item.code] || 0
                const v2 = currentCarryOver[2][item.code] || 0
                const v3 = currentCarryOver[3][item.code] || 0
                const v4 = currentCarryOver[4][item.code] || 0
                const isSelected = selectedItems.has(item.code)
                const delta = selectedItems.get(item.code) || 0
                const refValue = currentCarryOver[referenceMode][item.code] || 0
                const shortcutDelta = -refValue // delta ที่ทำให้เคสอ้างอิงเป็น 0
                return (
                  <tr key={item.code} className={cn('border-t border-slate-100', isSelected && 'bg-[#3DD8D8]/5')}>
                    <td className="text-center px-2 py-1.5">
                      <input type="checkbox" checked={isSelected}
                        onChange={() => toggleItem(item.code)}
                        className="rounded" />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-slate-400 mr-1.5">{item.code}</span>
                      <span className="text-slate-700">{item.name}</span>
                    </td>
                    <td className={cn('text-right px-2 py-1.5 font-mono', colorOf(v1))}>{fmt(v1)}</td>
                    <td className={cn('text-right px-2 py-1.5 font-mono', colorOf(v2))}>{fmt(v2)}</td>
                    <td className={cn('text-right px-2 py-1.5 font-mono', colorOf(v3))}>{fmt(v3)}</td>
                    <td className={cn('text-right px-2 py-1.5 font-mono', colorOf(v4))}>{fmt(v4)}</td>
                    {type === 'adjust' && <>
                      <td className="px-2 py-1.5">
                        {isSelected ? (
                          <input type="number" value={delta}
                            onChange={e => setItemDelta(item.code, parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]" />
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {isSelected && shortcutDelta !== 0 && (
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
