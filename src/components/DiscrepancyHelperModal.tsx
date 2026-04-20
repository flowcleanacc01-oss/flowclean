'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Wrench, Info, AlertTriangle, Check } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '@/lib/store'
import { cn, formatDate, formatCurrency } from '@/lib/utils'
import { applyRowsSync, recalcTransportAfterSync } from '@/lib/sync-discrepancy'
import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-fill ลูกค้า (optional) */
  initialCustomerId?: string
  /** Pre-fill LF (optional) */
  initialLfId?: string
}

/**
 * Discrepancy Helper Modal (75)
 *
 * Single entry point สำหรับ "ลูกค้าแจ้งจำนวนผ้านับไม่ตรง"
 * Wizard 3 steps:
 * 1. เลือก customer + LF
 * 2. ระบุรายการที่นับไม่ตรง (กรอกจำนวนใหม่)
 * 3. Preview + Detect scenario + ยืนยัน
 *
 * Smart detection:
 * - LF ยังไม่มี SD → sync col6+col4 ใน LF
 * - LF มี SD แต่ไม่ billed → sync ทั้ง SD + LF + recalc fees
 * - LF มี SD billed → block + ปุ่ม "ไปลบ WB"
 */
export default function DiscrepancyHelperModal({ open, onClose, initialCustomerId, initialLfId }: Props) {
  const {
    currentUser, customers, linenForms, deliveryNotes, billingStatements,
    updateLinenForm, updateDeliveryNote, quotations, getCustomer,
  } = useStore()
  const router = useRouter()
  const previewRef = useRef<HTMLDivElement>(null)

  const [selCustomerId, setSelCustomerId] = useState(initialCustomerId || '')
  const [selLfId, setSelLfId] = useState(initialLfId || '')
  const [newQtyMap, setNewQtyMap] = useState<Map<string, number>>(new Map())
  const [discSyncRecalcMode, setDiscSyncRecalcMode] = useState<'recalc' | 'keep'>('recalc')

  // Reset state when modal opens
  useEffect(() => {
    if (!open) return
    setSelCustomerId(initialCustomerId || '')
    setSelLfId(initialLfId || '')
    setNewQtyMap(new Map())
    setDiscSyncRecalcMode('recalc')
  }, [open, initialCustomerId, initialLfId])

  // Customer's LFs (status confirmed only)
  const customerLfs = useMemo(() => {
    if (!selCustomerId) return []
    return linenForms
      .filter(f => f.customerId === selCustomerId && f.status === 'confirmed')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50)
  }, [linenForms, selCustomerId])

  const selLf = selLfId ? linenForms.find(f => f.id === selLfId) : null
  // SD link to this LF
  const linkedSD = selLf
    ? deliveryNotes.find(d => d.linenFormIds.includes(selLf.id))
    : null
  // WB link to SD
  const linkedWB = linkedSD
    ? billingStatements.find(b => b.deliveryNoteIds.includes(linkedSD.id))
    : null

  // Scenario detection
  const scenario: 'no_sd' | 'sd_unbilled' | 'sd_billed' | null = useMemo(() => {
    if (!selLf) return null
    if (!linkedSD) return 'no_sd'
    if (linkedWB) return 'sd_billed'
    return 'sd_unbilled'
  }, [selLf, linkedSD, linkedWB])

  // Items with changes
  const changes = useMemo(() => {
    if (!selLf) return []
    return [...newQtyMap.entries()]
      .map(([code, newQty]) => {
        const row = selLf.rows.find(r => r.code === code)
        if (!row) return null
        const oldCol6 = row.col6_factoryPackSend || 0
        const oldCol4 = row.col4_factoryApproved
        if (newQty === oldCol6 && newQty === oldCol4) return null
        return { code, oldCol6, oldCol4, newQty }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [selLf, newQtyMap])

  const canConfirm = changes.length > 0 && scenario !== 'sd_billed'

  // 112.1/115: Compute transport fee recalc preview (considers existing extra/discount)
  const recalcPreviewData = (() => {
    if (!linkedSD || changes.length === 0 || scenario === 'sd_billed') return null
    const customer = getCustomer(linkedSD.customerId)
    if (!customer) return null
    const updatedItems = linkedSD.items.map(it => {
      const change = changes.find(c => c.code === it.code)
      if (change && !it.isClaim) return { ...it, quantity: change.newQty }
      return it
    })
    const virtualDN = { ...linkedSD, items: updatedItems }
    const virtualDNs = deliveryNotes.map(d => d.id === linkedSD.id ? virtualDN : d)
    const results = recalcTransportAfterSync(
      virtualDN, customer, virtualDNs, quotations,
      linkedSD.extraCharge || 0, linkedSD.discount || 0,
    )
    const thisDn = results.find(r => r.dnId === linkedSD.id)
    const otherDnResult = results.find(r => r.dnId !== linkedSD.id)
    const otherDn = otherDnResult ? deliveryNotes.find(d => d.id === otherDnResult.dnId) : null
    const oldTripFee = linkedSD.transportFeeTrip || 0
    const newTripFee = thisDn?.newTripFee ?? oldTripFee
    const oldMonthFee = linkedSD.transportFeeMonth || 0
    const newMonthFee = thisDn?.newMonthFee
    const tripChanged = newTripFee !== oldTripFee
    const thisMonthChanged = newMonthFee !== undefined && newMonthFee !== oldMonthFee
    const otherMonthChanged = !!otherDnResult && otherDnResult.newMonthFee !== undefined
      && otherDnResult.newMonthFee !== (otherDn?.transportFeeMonth || 0)
    if (!tripChanged && !thisMonthChanged && !otherMonthChanged) return null
    return {
      oldTripFee, newTripFee, oldMonthFee, newMonthFee,
      tripChanged, thisMonthChanged, otherMonthChanged,
      otherDn, otherDnResult,
      hasAdj: (linkedSD.extraCharge || 0) > 0 || (linkedSD.discount || 0) > 0,
    }
  })()

  // 114.1+114.2: auto-scroll preview into view when it first appears
  const hasPreview = changes.length > 0
  useEffect(() => {
    if (!hasPreview) return
    const timer = setTimeout(() => {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
    return () => clearTimeout(timer)
  }, [hasPreview])

  // 114: arrow/enter navigation between quantity inputs
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault()
      const nextIndex = rowIndex + (e.key === 'ArrowUp' ? -1 : 1)
      const next = document.querySelector<HTMLInputElement>(`input[data-discrow="${nextIndex}"]`)
      if (next) { next.focus(); next.select() }
    }
  }

  const handleQtyChange = (code: string, qty: number) => {
    setNewQtyMap(prev => {
      const next = new Map(prev)
      next.set(code, qty)
      return next
    })
  }

  const handleConfirm = () => {
    if (!selLf || !canConfirm) return
    const inputs = changes.map(c => ({ code: c.code, newQty: c.newQty }))
    const source = linkedSD ? 'sd_edit' : 'lf_manual'
    const updatedRows = applyRowsSync(selLf.rows, inputs, source, currentUser?.name || 'unknown')

    // Update LF
    updateLinenForm(selLf.id, { rows: updatedRows })

    // Update SD if exists + recalc transport fees (112.1 fix: respects existing extra/discount)
    if (linkedSD) {
      const updatedItems = linkedSD.items.map(it => {
        const change = changes.find(c => c.code === it.code)
        if (change && !it.isClaim) return { ...it, quantity: change.newQty }
        return it
      })
      updateDeliveryNote(linkedSD.id, { items: updatedItems })

      if (discSyncRecalcMode === 'recalc') {
        const customer = getCustomer(linkedSD.customerId)
        if (customer) {
          const virtualDN = { ...linkedSD, items: updatedItems }
          const virtualDNs = deliveryNotes.map(d => d.id === linkedSD.id ? virtualDN : d)
          const results = recalcTransportAfterSync(
            virtualDN, customer, virtualDNs, quotations,
            linkedSD.extraCharge || 0, linkedSD.discount || 0,
          )
          for (const r of results) {
            const update: { transportFeeTrip?: number; transportFeeMonth?: number } = {}
            if (r.dnId === linkedSD.id) update.transportFeeTrip = r.newTripFee
            if (r.newMonthFee !== undefined) update.transportFeeMonth = r.newMonthFee
            if (Object.keys(update).length > 0) updateDeliveryNote(r.dnId, update)
          }
        }
      }
    }

    onClose()
  }

  const goToWB = () => {
    if (!linkedWB) return
    onClose()
    router.push(`/dashboard/billing?focus=${linkedWB.id}`)
  }

  return (
    <Modal open={open} onClose={onClose} title="🔧 ลูกค้าแจ้งจำนวนผ้านับไม่ตรง" size="xl" closeLabel="cancel">
      <div className="space-y-4">
        {/* Help text */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-xs text-blue-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            ใช้ tool นี้เมื่อลูกค้าแจ้งว่านับผ้ากลับไม่ตรง — ระบบจะ smart detect สถานการณ์และ
            ปรับ <strong>จำนวนโรงซักแพคส่ง</strong> ให้ตรงกับ <strong>จำนวนลูกค้านับกลับ</strong> ให้ตรงกันอัตโนมัติ
          </div>
        </div>

        {/* Step 1: Customer + LF */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Step 1: เลือกลูกค้า</label>
          <select value={selCustomerId} onChange={e => { setSelCustomerId(e.target.value); setSelLfId(''); setNewQtyMap(new Map()) }}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]">
            <option value="">— เลือกลูกค้า —</option>
            {customers.filter(c => c.isActive).map(c => (
              <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
            ))}
          </select>
        </div>

        {selCustomerId && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Step 2: เลือกใบรับส่งผ้า (LF) ที่จะแก้</label>
            {customerLfs.length === 0 ? (
              <div className="text-sm text-slate-400 px-3 py-2 bg-slate-50 rounded-lg">ลูกค้านี้ยังไม่มี LF status confirmed</div>
            ) : (
              <select value={selLfId} onChange={e => { setSelLfId(e.target.value); setNewQtyMap(new Map()) }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]">
                <option value="">— เลือก LF —</option>
                {customerLfs.map(f => {
                  const sd = deliveryNotes.find(d => d.linenFormIds.includes(f.id))
                  const wb = sd ? billingStatements.find(b => b.deliveryNoteIds.includes(sd.id)) : null
                  return (
                    <option key={f.id} value={f.id}>
                      {f.formNumber} ({formatDate(f.date)}){sd ? ` — มี SD${wb ? ' + WB ❌' : ''}` : ' — ยังไม่มี SD'}
                    </option>
                  )
                })}
              </select>
            )}
          </div>
        )}

        {/* Step 3: Items */}
        {selLf && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Step 3: ระบุรายการที่นับไม่ตรง</label>
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 w-24">โรงซักแพคส่ง</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 w-28">ลูกค้านับผ้ากลับ (เดิม)</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 w-28">ลูกค้านับผ้ากลับ (ใหม่)</th>
                  </tr>
                </thead>
                <tbody>
                  {selLf.rows.map((r, rowIndex) => {
                    const displayVal = newQtyMap.has(r.code) ? newQtyMap.get(r.code)! : ''
                    return (
                      <tr key={r.code} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-mono text-slate-500">{r.code}</td>
                        <td className="text-right px-2 py-1.5 font-mono">{r.col6_factoryPackSend || 0}</td>
                        <td className="text-right px-2 py-1.5 font-mono">{r.col4_factoryApproved || 0}</td>
                        <td className="text-right px-2 py-1.5">
                          <input type="number" min={0} value={displayVal}
                            placeholder="-"
                            data-discrow={rowIndex}
                            onFocus={e => e.currentTarget.select()}
                            onKeyDown={e => handleInputKeyDown(e, rowIndex)}
                            onChange={e => {
                              if (e.target.value === '') {
                                setNewQtyMap(prev => { const next = new Map(prev); next.delete(r.code); return next })
                              } else {
                                handleQtyChange(r.code, parseInt(e.target.value) || 0)
                              }
                            }}
                            className="w-20 px-2 py-1 border border-slate-200 rounded text-right text-xs focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Preview + Scenario */}
        {selLf && changes.length > 0 && (
          <div ref={previewRef} className="space-y-2">
            {scenario === 'sd_billed' ? (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex gap-2 text-orange-800">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <p className="font-semibold mb-1">ไม่สามารถแก้ได้ — มี WB แล้ว</p>
                  <p>SD <strong>{linkedSD?.noteNumber}</strong> ออกใบวางบิลแล้ว (<strong>{linkedWB?.billingNumber}</strong>)</p>
                  <p className="mt-1">ต้องลบ WB ก่อน (ถ้ามี IV ให้ลบ IV ก่อน) แล้วกลับมาใช้ tool นี้อีกครั้ง</p>
                  <button onClick={goToWB}
                    className="mt-2 px-3 py-1 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                    → ไปลบ WB
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
                  <p className="font-semibold mb-2 flex items-center gap-1">
                    <Check className="w-4 h-4" />ระบบจะดำเนินการ:
                  </p>
                  <div className="space-y-1 ml-5">
                    <p>✅ Update LF <strong>{selLf.formNumber}</strong>:</p>
                    {changes.map(c => (
                      <p key={c.code} className="ml-4 font-mono">
                        • {c.code}: col6 {c.oldCol6}→{c.newQty}, col4 {c.oldCol4}→{c.newQty} (sync)
                      </p>
                    ))}
                    {linkedSD && (
                      <>
                        <p className="mt-1">✅ Update SD <strong>{linkedSD.noteNumber}</strong>:</p>
                        {changes.map(c => (
                          <p key={c.code} className="ml-4 font-mono">• {c.code}: quantity = {c.newQty}</p>
                        ))}
                      </>
                    )}
                    <p>✅ บันทึก audit log + ค่าเดิมเก็บไว้สำหรับรายงาน Type 2</p>
                  </div>
                </div>

                {/* 112.1/115: Transport fee recalc preview */}
                {recalcPreviewData && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-3">
                    <p className="text-sm font-medium text-blue-800">⚠ ค่ารถจะเปลี่ยนเพราะจำนวนชิ้นเปลี่ยน</p>
                    <table className="w-full text-sm">
                      <tbody>
                        {recalcPreviewData.tripChanged && (
                          <tr className="border-b border-blue-100">
                            <td className="py-1.5 text-slate-700">ค่ารถ (ครั้ง) — SD นี้</td>
                            <td className="py-1.5 text-right text-red-600 line-through pr-3">{formatCurrency(recalcPreviewData.oldTripFee)}</td>
                            <td className="py-1.5 text-center text-slate-400 px-1">→</td>
                            <td className="py-1.5 text-right text-emerald-600 font-medium">{formatCurrency(recalcPreviewData.newTripFee)}</td>
                          </tr>
                        )}
                        {recalcPreviewData.thisMonthChanged && (
                          <tr className="border-b border-blue-100">
                            <td className="py-1.5 text-slate-700">ค่ารถ (เดือน) — SD นี้</td>
                            <td className="py-1.5 text-right text-red-600 line-through pr-3">{formatCurrency(recalcPreviewData.oldMonthFee)}</td>
                            <td className="py-1.5 text-center text-slate-400 px-1">→</td>
                            <td className="py-1.5 text-right text-emerald-600 font-medium">{formatCurrency(recalcPreviewData.newMonthFee || 0)}</td>
                          </tr>
                        )}
                        {recalcPreviewData.otherMonthChanged && recalcPreviewData.otherDn && (
                          <tr>
                            <td className="py-1.5 text-slate-700">ค่ารถ (เดือน) — SD ใบสุดท้าย <span className="font-mono text-xs text-slate-400">({recalcPreviewData.otherDn.noteNumber})</span></td>
                            <td className="py-1.5 text-right text-red-600 line-through pr-3">{formatCurrency(recalcPreviewData.otherDn.transportFeeMonth || 0)}</td>
                            <td className="py-1.5 text-center text-slate-400 px-1">→</td>
                            <td className="py-1.5 text-right text-emerald-600 font-medium">{formatCurrency(recalcPreviewData.otherDnResult?.newMonthFee || 0)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {recalcPreviewData.hasAdj && (
                      <p className="text-xs text-blue-600">* คำนวณรวม extra/discount ที่มีอยู่ใน SD แล้ว</p>
                    )}
                    <div className="space-y-2 pt-2 border-t border-blue-200">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="discSyncMode" checked={discSyncRecalcMode === 'recalc'} onChange={() => setDiscSyncRecalcMode('recalc')} className="accent-[#1B3A5C]" />
                        <span className="text-slate-700">อัปเดตค่ารถตามจำนวนใหม่ <span className="text-slate-400">(แนะนำ)</span></span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="discSyncMode" checked={discSyncRecalcMode === 'keep'} onChange={() => setDiscSyncRecalcMode('keep')} className="accent-[#1B3A5C]" />
                        <span className="text-slate-700">เก็บค่ารถเดิม <span className="text-slate-400">(ไม่ recalc)</span></span>
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">ยกเลิก</button>
          <button onClick={handleConfirm} disabled={!canConfirm}
            className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:bg-slate-100 disabled:text-slate-400 font-semibold flex items-center gap-1.5">
            <Wrench className="w-4 h-4" />ยืนยันบันทึก
          </button>
        </div>
      </div>
    </Modal>
  )
}
