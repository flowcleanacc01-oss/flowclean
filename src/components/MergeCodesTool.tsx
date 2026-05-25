'use client'

/**
 * 174 ขั้น 2 — Merge Codes Tool (admin only)
 *
 * รวม code A → code B (master) ทั่วทั้งระบบ:
 *   - Quotation.items[].code
 *   - Customer.enabledItems[], priceList[].code, priceHistory[].code
 *   - DeliveryNote.items[].code, priceSnapshot keys
 *   - (option) BillingStatement.lineItems[].code  ← เอกสารที่ออกแล้ว — toggle off default
 *   - (option) TaxInvoice.lineItems[].code        ← เอกสารที่ออกแล้ว — toggle off default
 *   - (option) ลบ source code จาก catalog หลังรวม
 *
 * Workflow: Source + Target → Preview → Confirm → Execute
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, AlertTriangle, CheckCircle2, Loader2, Lock, Users, FileCheck } from 'lucide-react'
import { useStore } from '@/lib/store'
import { pushUndoAction, type SnapshotChange } from '@/lib/undo-stack'
import { useOrphanCodes } from '@/lib/use-orphan-codes'
import { isProtectedItem, PROTECTED_CODE_REASON } from '@/lib/protected-codes'
import { cn } from '@/lib/utils'

type Stat = { label: string; count: number; affectedIds: string[] }

interface Props {
  /** 238: prefill source code (เช่นจาก carry-over orphan badge) */
  initialSource?: string
  /** 238: prefill deleteSource flag (สำหรับ "ลบรหัสนี้ออกจากระบบ") */
  initialDeleteSource?: boolean
  /** 240: prefill target code (1-click reassign จาก Orphan Inspector) */
  initialTarget?: string
}

export default function MergeCodesTool({ initialSource, initialDeleteSource, initialTarget }: Props = {}) {
  const {
    linenCatalog,
    quotations, updateQuotation,
    customers, updateCustomer,
    deliveryNotes, updateDeliveryNote,
    billingStatements, updateBillingStatement,
    taxInvoices, updateTaxInvoice,
    linenForms, updateLinenForm,
    carryOverAdjustments, updateCarryOverAdjustment,
    deleteLinenItem,
  } = useStore()

  const [sourceCode, setSourceCode] = useState(initialSource ?? '')
  const [targetCode, setTargetCode] = useState(initialTarget ?? '')
  const [includeWB, setIncludeWB] = useState(false)
  const [includeIV, setIncludeIV] = useState(false)
  const [deleteSource, setDeleteSource] = useState(initialDeleteSource ?? false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<{ stats: Stat[]; ts: string } | null>(null)

  // 238/240: sync source/target/delete จาก parent (เช่น URL params เปลี่ยน)
  useEffect(() => {
    if (initialSource && initialSource !== sourceCode) setSourceCode(initialSource)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSource])
  useEffect(() => {
    if (initialTarget && initialTarget !== targetCode) setTargetCode(initialTarget)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget])
  useEffect(() => {
    if (initialDeleteSource !== undefined) setDeleteSource(initialDeleteSource)
  }, [initialDeleteSource])

  const sortedCatalog = useMemo(
    () => [...linenCatalog].sort((a, b) => a.code.localeCompare(b.code)),
    [linenCatalog],
  )

  // 240 fix: รวม orphan codes (code ที่ลบจาก catalog แล้ว แต่ยังอยู่ใน QT/LF/DN/Customer)
  // เข้า source dropdown — ก่อนหน้านี้ user เลือก orphan ไม่ได้ → reassign ไม่ได้!
  const { orphans } = useOrphanCodes()
  const sourceOptions = useMemo(() => {
    const catItems = sortedCatalog.map(i => ({
      code: i.code, name: i.name, isOrphan: false, defaultPrice: i.defaultPrice,
      isProtected: isProtectedItem(i),
    }))
    const orphanItems = orphans.map(e => ({
      code: e.code,
      name: e.names[0] || '(ไม่พบชื่อ — orphan)',
      isOrphan: true,
      defaultPrice: e.avgPrice,
      isProtected: false, // orphan ไม่อยู่ใน catalog → lock ไม่ได้
    }))
    return [...catItems, ...orphanItems].sort((a, b) => a.code.localeCompare(b.code))
  }, [sortedCatalog, orphans])

  const sourceItem = sourceOptions.find(i => i.code === sourceCode)
  const targetItem = linenCatalog.find(i => i.code === targetCode)

  // 347: Protected item lock — block merge ทั้งสองทิศ (source + target)
  //      lookup จาก catalog ปัจจุบัน (field-based — ไม่ใช่ regex)
  const sourceProtected = isProtectedItem(linenCatalog.find(i => i.code === sourceCode))
  const targetProtected = isProtectedItem(linenCatalog.find(i => i.code === targetCode))
  const isProtectedBlocked = sourceProtected || targetProtected

  // Build preview stats
  const stats = useMemo<Stat[]>(() => {
    if (!sourceCode || !targetCode || sourceCode === targetCode) return []
    const src = sourceCode

    const qtMatches = quotations.filter(q => (q.items || []).some(it => it.code === src))
    const dnMatches = deliveryNotes.filter(d =>
      (d.items || []).some(it => it.code === src) ||
      (d.priceSnapshot && Object.prototype.hasOwnProperty.call(d.priceSnapshot, src))
    )
    const custMatches = customers.filter(c =>
      (c.enabledItems || []).includes(src) ||
      (c.priceList || []).some(p => p.code === src) ||
      (c.priceHistory || []).some(p => (p as { code?: string }).code === src)
    )
    // 229: เพิ่ม LF coverage ที่ขาดหายไป — ก่อนหน้านี้ MergeCodesTool ไม่แตะ LF เลย
    const lfMatches = linenForms.filter(f => (f.rows || []).some(r => r.code === src))
    // 240.2: เพิ่ม CO Adjustments — ตารางปรับผ้าค้าง (เคสจริง: A19 ค้างอยู่ตรงนี้เท่านั้น)
    const coaMatches = carryOverAdjustments.filter(ca => !ca.isDeleted && (ca.items || []).some(it => it.code === src))
    const wbMatches = billingStatements.filter(b => (b.lineItems || []).some(li => li.code === src))
    const ivMatches = taxInvoices.filter(t => (t.lineItems || []).some(li => li.code === src))

    return [
      { label: 'Quotation (QT)',         count: qtMatches.length,   affectedIds: qtMatches.map(q => q.id) },
      { label: 'Linen Form (LF) — rows', count: lfMatches.length, affectedIds: lfMatches.map(f => f.id) },
      { label: 'Customer (enabledItems/priceList)', count: custMatches.length, affectedIds: custMatches.map(c => c.id) },
      { label: 'Delivery Note (SD) + priceSnapshot', count: dnMatches.length, affectedIds: dnMatches.map(d => d.id) },
      { label: 'Carry-Over ปรับผ้าค้าง', count: coaMatches.length, affectedIds: coaMatches.map(ca => ca.id) },
      { label: `Billing (WB) ${includeWB ? '— จะเปลี่ยน' : '— ข้าม'}`,         count: wbMatches.length, affectedIds: wbMatches.map(b => b.id) },
      { label: `Tax Invoice (IV) ${includeIV ? '— จะเปลี่ยน' : '— ข้าม'}`,     count: ivMatches.length, affectedIds: ivMatches.map(t => t.id) },
    ]
  }, [sourceCode, targetCode, quotations, customers, deliveryNotes, linenForms, carryOverAdjustments, billingStatements, taxInvoices, includeWB, includeIV])

  const totalAffected = stats.reduce((s, x) => s + x.count, 0)
  const canPreview = sourceCode && targetCode && sourceCode !== targetCode && !isProtectedBlocked

  // 338: LF impact warning — true เมื่อมี LF ที่ใช้ source code (= ลูกค้าเห็นไปแล้ว)
  const lfImpactStat = stats.find(s => s.label.startsWith('Linen Form'))
  const custImpactStat = stats.find(s => s.label.startsWith('Customer'))
  const dnImpactStat = stats.find(s => s.label.startsWith('Delivery Note'))
  const wbImpactStat = stats.find(s => s.label.startsWith('Billing'))
  const ivImpactStat = stats.find(s => s.label.startsWith('Tax Invoice'))
  const lfImpactCount = lfImpactStat?.count ?? 0
  const custImpactCount = custImpactStat?.count ?? 0
  const dnImpactCount = dnImpactStat?.count ?? 0
  const wbImpactCount = wbImpactStat?.count ?? 0
  const ivImpactCount = ivImpactStat?.count ?? 0

  // High-impact = customer-facing docs (DN/WB/IV) ออกไปแล้ว หรือ LF + customer ≥ 5
  const isHighImpact = dnImpactCount > 0 || (includeWB && wbImpactCount > 0) || (includeIV && ivImpactCount > 0) ||
    (lfImpactCount + custImpactCount >= 5)

  // ดึงรายชื่อลูกค้าที่กระทบจาก LF + DN + Customer (deduped)
  const affectedCustomerNames = useMemo<string[]>(() => {
    if (!canPreview) return []
    const src = sourceCode
    const names = new Set<string>()
    const custById = new Map(customers.map(c => [c.id, c.shortName]))
    for (const f of linenForms) {
      if ((f.rows || []).some(r => r.code === src)) {
        names.add(custById.get(f.customerId) || f.customerId.slice(0, 8))
      }
    }
    for (const d of deliveryNotes) {
      const hasSrc = (d.items || []).some(it => it.code === src) ||
        (d.priceSnapshot && Object.prototype.hasOwnProperty.call(d.priceSnapshot, src))
      if (hasSrc) names.add(custById.get(d.customerId) || d.customerId.slice(0, 8))
    }
    for (const c of customers) {
      if ((c.enabledItems || []).includes(src) ||
          (c.priceList || []).some(p => p.code === src)) {
        names.add(c.shortName)
      }
    }
    return Array.from(names).sort()
  }, [canPreview, sourceCode, linenForms, deliveryNotes, customers])

  const execute = async () => {
    if (!canPreview) return
    if (isProtectedBlocked) {
      alert(PROTECTED_CODE_REASON)
      return
    }
    setRunning(true)
    const src = sourceCode
    const tgt = targetCode
    const tgtItem = linenCatalog.find(i => i.code === tgt)
    const tgtName = tgtItem?.name || tgt
    const undoChanges: SnapshotChange[] = []

    try {
      // 1. Quotations
      const qtList = quotations.filter(q => (q.items || []).some(it => it.code === src))
      for (const q of qtList) {
        undoChanges.push({ table: 'quotations', id: q.id, op: 'update', oldData: { items: q.items } })
        const newItems = q.items.map(it =>
          it.code === src ? { ...it, code: tgt, name: tgtName } : it
        )
        updateQuotation(q.id, { items: newItems })
      }

      // 2. Customers
      const custList = customers.filter(c =>
        (c.enabledItems || []).includes(src) ||
        (c.priceList || []).some(p => p.code === src) ||
        (c.priceHistory || []).some(p => (p as { code?: string }).code === src)
      )
      for (const c of custList) {
        const updates: Record<string, unknown> = {}
        if ((c.enabledItems || []).includes(src)) {
          const merged = Array.from(new Set((c.enabledItems || []).map(x => x === src ? tgt : x)))
          updates.enabledItems = merged
        }
        if ((c.priceList || []).some(p => p.code === src)) {
          // Merge: ถ้ามี tgt อยู่แล้วเก็บ tgt ราคาเดิม, ถ้ายังไม่มี เปลี่ยน src → tgt
          const hasTgt = c.priceList.some(p => p.code === tgt)
          updates.priceList = hasTgt
            ? c.priceList.filter(p => p.code !== src)
            : c.priceList.map(p => p.code === src ? { ...p, code: tgt } : p)
        }
        if ((c.priceHistory || []).some(p => (p as unknown as { code?: string }).code === src)) {
          updates.priceHistory = (c.priceHistory as unknown as Array<Record<string, unknown>>).map(p =>
            p.code === src ? { ...p, code: tgt } : p
          )
        }
        if (Object.keys(updates).length > 0) {
          undoChanges.push({
            table: 'customers', id: c.id, op: 'update',
            oldData: {
              enabledItems: c.enabledItems,
              priceList: c.priceList,
              priceHistory: c.priceHistory,
            },
          })
          updateCustomer(c.id, updates)
        }
      }

      // 3. Delivery Notes
      const dnList = deliveryNotes.filter(d =>
        (d.items || []).some(it => it.code === src) ||
        (d.priceSnapshot && Object.prototype.hasOwnProperty.call(d.priceSnapshot, src))
      )
      for (const d of dnList) {
        const updates: Record<string, unknown> = {}
        if ((d.items || []).some(it => it.code === src)) {
          updates.items = d.items.map(it => it.code === src ? { ...it, code: tgt } : it)
        }
        if (d.priceSnapshot && Object.prototype.hasOwnProperty.call(d.priceSnapshot, src)) {
          const snap = { ...d.priceSnapshot }
          if (!Object.prototype.hasOwnProperty.call(snap, tgt)) snap[tgt] = snap[src]
          delete snap[src]
          updates.priceSnapshot = snap
        }
        if (Object.keys(updates).length > 0) {
          undoChanges.push({
            table: 'delivery_notes', id: d.id, op: 'update',
            oldData: { items: d.items, priceSnapshot: d.priceSnapshot },
          })
          updateDeliveryNote(d.id, updates)
        }
      }

      // 3.5 (229): Linen Forms — rewrite row.code (เพิ่มที่ขาดหายไป)
      const lfList = linenForms.filter(f => (f.rows || []).some(r => r.code === src))
      for (const f of lfList) {
        undoChanges.push({ table: 'linen_forms', id: f.id, op: 'update', oldData: { rows: f.rows } })
        const newRows = f.rows.map(r => r.code === src ? { ...r, code: tgt } : r)
        updateLinenForm(f.id, { rows: newRows })
      }

      // 3.6 (240.2): Carry-Over Adjustments — rewrite items[].code
      // เคสจริง: A19 ค้างเฉพาะที่ตารางนี้ — ก่อนหน้านี้ MergeCodesTool ไม่แตะ → orphan ลบไม่หาย
      // Merge logic: ถ้ารายการมี code ใหม่อยู่แล้วในแถวเดียวกัน → รวม delta (sum) แทน duplicate
      const coaList = carryOverAdjustments.filter(ca =>
        !ca.isDeleted && (ca.items || []).some(it => it.code === src)
      )
      for (const ca of coaList) {
        undoChanges.push({ table: 'carry_over_adjustments', id: ca.id, op: 'update', oldData: { items: ca.items } })
        // Build new items: merge src → tgt, sum delta if tgt already exists
        const tgtExisting = ca.items.find(it => it.code === tgt)
        const srcItems = ca.items.filter(it => it.code === src)
        const otherItems = ca.items.filter(it => it.code !== src && it.code !== tgt)
        const sumSrcDelta = srcItems.reduce((s, it) => s + (it.delta || 0), 0)
        const newTgtDelta = (tgtExisting?.delta || 0) + sumSrcDelta
        const newItems = [...otherItems, { code: tgt, delta: newTgtDelta }]
        updateCarryOverAdjustment(ca.id, { items: newItems }, `merge ${src} → ${tgt}`)
      }

      // 4. Billing Statements (optional)
      if (includeWB) {
        const wbList = billingStatements.filter(b => (b.lineItems || []).some(li => li.code === src))
        for (const b of wbList) {
          undoChanges.push({ table: 'billing_statements', id: b.id, op: 'update', oldData: { lineItems: b.lineItems } })
          const newLineItems = b.lineItems.map(li =>
            li.code === src ? { ...li, code: tgt, name: tgtName } : li
          )
          updateBillingStatement(b.id, { lineItems: newLineItems })
        }
      }

      // 5. Tax Invoices (optional)
      if (includeIV) {
        const ivList = taxInvoices.filter(t => (t.lineItems || []).some(li => li.code === src))
        for (const t of ivList) {
          undoChanges.push({ table: 'tax_invoices', id: t.id, op: 'update', oldData: { lineItems: t.lineItems } })
          const newLineItems = t.lineItems.map(li =>
            li.code === src ? { ...li, code: tgt, name: tgtName } : li
          )
          updateTaxInvoice(t.id, { lineItems: newLineItems })
        }
      }

      // 6. Delete source code from catalog (optional)
      // 240 fix: ถ้า source เป็น orphan (ไม่อยู่ใน catalog) → skip delete (ไม่มีอะไรให้ลบ)
      if (deleteSource) {
        const deletedItem = linenCatalog.find(i => i.code === src)
        if (deletedItem) {
          undoChanges.push({ table: 'linen_items', id: src, op: 'delete', oldData: deletedItem as unknown as Record<string, unknown> })
          deleteLinenItem(src)
        }
      }

      // 197: push undo
      if (undoChanges.length > 0) {
        pushUndoAction({
          type: 'merge_codes',
          description: `Merge ${src} → ${tgt}${deleteSource ? ' (ลบ source)' : ''}`,
          meta: { from: src, to: tgt, includeWB, includeIV, deleteSource, recordCount: undoChanges.length },
          changes: undoChanges,
        })
      }

      setDone({ stats, ts: new Date().toLocaleString('th-TH') })
      setShowConfirm(false)
      // reset selection so user can run another merge cleanly
      setSourceCode('')
      setTargetCode('')
    } catch (err) {
      console.error('merge error:', err)
      alert('เกิดข้อผิดพลาดระหว่างการรวม — ดู console')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <strong>เครื่องมือรวมรหัส (admin)</strong> — ใช้เมื่อรหัสเดียวกันถูกบันทึก 2-3 รหัส
          (เช่น S037 + A92 + H22 = ปลอกหมอนซิบ) แล้วต้องการ merge ให้เหลือ master เดียว
          <br />
          ระบบจะอัปเดต Code ใน QT / Customer / SD (priceSnapshot) ทุกที่
          ส่วน WB/IV ที่ออกแล้วจะ <strong>ข้าม</strong> เว้นจะติ๊กให้รวมด้วย
        </div>
      </div>

      {/* Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">รหัสต้นทาง (ที่จะถูกแทนที่)</label>
            <select
              value={sourceCode}
              onChange={e => setSourceCode(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">— เลือกรหัสต้นทาง —</option>
              {/* 240 fix: รวม catalog + orphan (orphan tag ⚠ — ไม่อยู่ใน catalog แล้ว) */}
              {/* 338: tag protected (X-prefix) */}
              {sourceOptions.map(i => (
                <option key={i.code} value={i.code}>
                  {i.code} — {i.name}
                  {i.isOrphan ? ' ⚠ (orphan)' : ''}
                  {i.isProtected ? ' 🔒 (locked)' : ''}
                </option>
              ))}
            </select>
            {sourceItem && (
              <p className="text-[11px] text-slate-500 mt-1">
                {sourceItem.name}
                {sourceItem.defaultPrice > 0 && <> · ราคา {sourceItem.defaultPrice}</>}
                {sourceItem.isOrphan && <span className="ml-1 text-orange-600">· orphan (ไม่อยู่ใน catalog แล้ว)</span>}
                {sourceItem.isProtected && <span className="ml-1 text-purple-700">· 🔒 locked</span>}
              </p>
            )}
          </div>
          <ArrowRight className="w-5 h-5 text-slate-400 mb-3 hidden sm:block" />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">รหัสปลายทาง (master)</label>
            <select
              value={targetCode}
              onChange={e => setTargetCode(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">— เลือกรหัสปลายทาง —</option>
              {sortedCatalog.filter(i => i.code !== sourceCode).map(i => {
                const tProt = isProtectedItem(i)
                return (
                  <option key={i.code} value={i.code}>
                    {i.code} — {i.name}{tProt ? ' 🔒 (locked)' : ''}
                  </option>
                )
              })}
            </select>
            {targetItem && (
              <p className="text-[11px] text-slate-500 mt-1">
                {targetItem.name} · ราคา {targetItem.defaultPrice}
                {targetProtected && <span className="ml-1 text-purple-700">· 🔒 locked</span>}
              </p>
            )}
          </div>
        </div>

        {/* 347: Protected item block — แสดงเมื่อ source/target ถูกล็อค (is_protected=true) */}
        {isProtectedBlocked && (() => {
          const srcLocked = linenCatalog.find(i => i.code === sourceCode)
          const tgtLocked = linenCatalog.find(i => i.code === targetCode)
          return (
            <div className="bg-purple-50 border-2 border-purple-300 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
              <Lock className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="text-purple-900 flex-1">
                <strong>🔒 รายการนี้ถูกล็อค — ไม่สามารถ merge ได้</strong>
                <p className="mt-1 text-xs text-purple-700">{PROTECTED_CODE_REASON}</p>
                {sourceProtected && srcLocked && (
                  <div className="mt-1.5 text-xs bg-white/50 rounded px-2 py-1 border border-purple-200">
                    <strong>Source {sourceCode}</strong> ({srcLocked.name})
                    {srcLocked.protectedReason && <span className="block mt-0.5 text-purple-600">📝 {srcLocked.protectedReason}</span>}
                    {srcLocked.protectedBy && (
                      <span className="block mt-0.5 text-[10px] text-purple-500">
                        ล็อคโดย {srcLocked.protectedBy}
                        {srcLocked.protectedAt && ` · ${srcLocked.protectedAt.slice(0, 10)}`}
                      </span>
                    )}
                  </div>
                )}
                {targetProtected && tgtLocked && (
                  <div className="mt-1.5 text-xs bg-white/50 rounded px-2 py-1 border border-purple-200">
                    <strong>Target {targetCode}</strong> ({tgtLocked.name})
                    {tgtLocked.protectedReason && <span className="block mt-0.5 text-purple-600">📝 {tgtLocked.protectedReason}</span>}
                    {tgtLocked.protectedBy && (
                      <span className="block mt-0.5 text-[10px] text-purple-500">
                        ล็อคโดย {tgtLocked.protectedBy}
                        {tgtLocked.protectedAt && ` · ${tgtLocked.protectedAt.slice(0, 10)}`}
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-1.5 text-[11px] text-purple-600 italic">
                  ถ้าต้องการ merge จริงๆ → ไปที่หน้ารายการผ้า → คลิก 🔓 ปลดล็อคก่อน
                </p>
              </div>
            </div>
          )
        })()}

        {/* Options */}
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={includeWB} onChange={e => setIncludeWB(e.target.checked)}
              className="rounded border-slate-300" />
            รวมใบวางบิล (WB) ที่ออกแล้วด้วย <span className="text-amber-600 text-xs">⚠ กระทบเอกสารที่ส่งลูกค้าแล้ว</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={includeIV} onChange={e => setIncludeIV(e.target.checked)}
              className="rounded border-slate-300" />
            รวมใบกำกับภาษี (IV) ที่ออกแล้วด้วย <span className="text-red-600 text-xs">⚠ ผลกระทบทาง compliance</span>
          </label>
          {/* 240 fix: ถ้า source เป็น orphan → ไม่ต้องแสดง "ลบ" toggle (ลบจาก catalog ไปแล้ว) */}
          {!sourceItem?.isOrphan && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={deleteSource} onChange={e => setDeleteSource(e.target.checked)}
                className="rounded border-slate-300" />
              ลบรหัสต้นทาง <strong>{sourceCode || '...'}</strong> ออกจาก catalog หลังรวมเสร็จ
            </label>
          )}
          {sourceItem?.isOrphan && (
            <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
              ℹ <strong>{sourceCode}</strong> เป็น orphan (ลบจาก catalog ไปแล้ว) — ไม่มี &quot;ลบจาก catalog&quot; ให้ติ๊ก · merge นี้จะ rewrite reference ทั้งหมดเป็น <strong>{targetCode || '...'}</strong>
            </div>
          )}
        </div>

        {/* Preview */}
        {canPreview && (
          <div className="border-t border-slate-100 pt-3">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              ผลกระทบ: {sourceCode} → {targetCode} (รวม {totalAffected} เอกสาร)
            </h3>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">ประเภทเอกสาร</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 w-32">จำนวน</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{s.label}</td>
                      <td className="px-3 py-2 text-right font-mono">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowConfirm(true)}
                disabled={totalAffected === 0 && !deleteSource}
                className="px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 text-sm font-medium"
              >
                ดำเนินการรวม
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm modal — inline (not Modal component, since we are in a page) */}
      {/* 338: เพิ่ม LF impact warning + รายชื่อลูกค้า + "ตรวจกับลูกค้าก่อน" callout */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] px-4 animate-fadeIn">
          <div className="fixed inset-0 bg-black/40" onClick={() => !running && setShowConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className={cn(
                'w-6 h-6 flex-shrink-0 mt-0.5',
                isHighImpact ? 'text-red-500' : 'text-amber-500',
              )} />
              <div>
                <h3 className="text-lg font-semibold text-slate-800">ยืนยันการรวมรหัส</h3>
                <p className="text-sm text-slate-600 mt-1">
                  รวม <code className="bg-slate-100 px-1.5 py-0.5 rounded">{sourceCode}</code> →{' '}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded">{targetCode}</code>
                </p>
              </div>
            </div>

            {/* 338: High-impact callout — เน้นเรื่อง "ลูกค้าเห็นไปแล้ว" */}
            {isHighImpact && (
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4 space-y-2">
                <div className="flex items-center gap-2 font-bold text-red-900">
                  <FileCheck className="w-5 h-5" />
                  ⚠ ตรวจกับลูกค้าก่อน — เอกสารส่งไปแล้ว
                </div>
                <p className="text-xs text-red-800">
                  รหัสนี้อยู่ในเอกสารที่ออกให้ลูกค้าเรียบร้อยแล้ว
                  ถ้า merge ผิด ลูกค้าจะเห็นรายการที่เปลี่ยนแปลง — ตามแก้ยาก (ต้องลบ + สร้างใหม่)
                </p>
                <ul className="text-xs text-red-700 ml-4 list-disc space-y-0.5">
                  {dnImpactCount > 0 && <li><strong>{dnImpactCount}</strong> ใบส่งของ (SD)</li>}
                  {includeWB && wbImpactCount > 0 && <li><strong>{wbImpactCount}</strong> ใบวางบิล (WB) — ⚠ ส่งลูกค้าแล้ว</li>}
                  {includeIV && ivImpactCount > 0 && <li><strong>{ivImpactCount}</strong> ใบกำกับภาษี (IV) — ⚠ compliance impact</li>}
                  {lfImpactCount > 0 && <li><strong>{lfImpactCount}</strong> ใบรับส่งผ้า (LF)</li>}
                  {custImpactCount > 0 && <li><strong>{custImpactCount}</strong> ลูกค้า (priceList/enabled)</li>}
                </ul>
              </div>
            )}

            {/* 338: Affected customer list — ให้รู้ว่ากระทบลูกค้าไหนบ้าง */}
            {affectedCustomerNames.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 mb-2">
                  <Users className="w-4 h-4" />
                  ลูกค้าที่กระทบ ({affectedCustomerNames.length} ราย)
                </div>
                <div className="flex flex-wrap gap-1">
                  {affectedCustomerNames.slice(0, 30).map(n => (
                    <span key={n} className="inline-block bg-white border border-amber-200 text-amber-800 text-[11px] px-1.5 py-0.5 rounded font-mono">
                      {n}
                    </span>
                  ))}
                  {affectedCustomerNames.length > 30 && (
                    <span className="text-[11px] text-amber-700 italic">+ อีก {affectedCustomerNames.length - 30} ราย</span>
                  )}
                </div>
                <p className="text-[11px] text-amber-700 mt-2 italic">
                  💡 ตัดสินใจร่วมกับติ๊ดและปิ่นก่อน merge — ลูกค้าแต่ละรายอาจใช้รหัสนี้ทำของต่างกัน
                </p>
              </div>
            )}

            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-700 mb-4 space-y-1">
              <div className="font-semibold text-slate-800 mb-1">สรุปการกระทบ</div>
              <div>• เอกสารที่จะถูกแก้ไข: <strong>{totalAffected}</strong></div>
              {includeWB && <div className="text-amber-700">• รวม WB ที่ออกแล้วด้วย</div>}
              {includeIV && <div className="text-red-700">• รวม IV ที่ออกแล้วด้วย</div>}
              {deleteSource && <div>• ลบ {sourceCode} จาก catalog</div>}
            </div>

            <p className="text-xs text-slate-500 mb-4">
              ⚠ การรวมจะถูกบันทึกใน Undo (7 วัน) — แต่ถ้าทำใหม่ทับซ้ำหลายครั้ง อาจ revert ยาก
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={running}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={execute}
                disabled={running}
                className={cn(
                  'px-4 py-2 text-sm rounded-lg disabled:opacity-50 flex items-center gap-1.5 font-medium',
                  isHighImpact
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-[#1B3A5C] text-white hover:bg-[#122740]',
                )}
              >
                {running ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังรวม...</> : isHighImpact ? '⚠ ยืนยัน merge (high impact)' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Done log */}
      {done && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-2">
            <CheckCircle2 className="w-5 h-5" />
            รวมเสร็จเรียบร้อย <span className="text-xs font-normal text-emerald-600">— {done.ts}</span>
          </div>
          <ul className="text-sm text-emerald-800 space-y-0.5 ml-7 list-disc">
            {done.stats.map((s, i) => (
              <li key={i}>{s.label}: {s.count} เอกสาร</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
