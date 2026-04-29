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
import { useMemo, useState } from 'react'
import { ArrowRight, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { pushUndoAction, type SnapshotChange } from '@/lib/undo-stack'

type Stat = { label: string; count: number; affectedIds: string[] }

export default function MergeCodesTool() {
  const {
    linenCatalog,
    quotations, updateQuotation,
    customers, updateCustomer,
    deliveryNotes, updateDeliveryNote,
    billingStatements, updateBillingStatement,
    taxInvoices, updateTaxInvoice,
    deleteLinenItem,
  } = useStore()

  const [sourceCode, setSourceCode] = useState('')
  const [targetCode, setTargetCode] = useState('')
  const [includeWB, setIncludeWB] = useState(false)
  const [includeIV, setIncludeIV] = useState(false)
  const [deleteSource, setDeleteSource] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<{ stats: Stat[]; ts: string } | null>(null)

  const sortedCatalog = useMemo(
    () => [...linenCatalog].sort((a, b) => a.code.localeCompare(b.code)),
    [linenCatalog],
  )

  const sourceItem = linenCatalog.find(i => i.code === sourceCode)
  const targetItem = linenCatalog.find(i => i.code === targetCode)

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
    const wbMatches = billingStatements.filter(b => (b.lineItems || []).some(li => li.code === src))
    const ivMatches = taxInvoices.filter(t => (t.lineItems || []).some(li => li.code === src))

    return [
      { label: 'Quotation (QT)',         count: qtMatches.length,   affectedIds: qtMatches.map(q => q.id) },
      { label: 'Customer (enabledItems/priceList)', count: custMatches.length, affectedIds: custMatches.map(c => c.id) },
      { label: 'Delivery Note (SD) + priceSnapshot', count: dnMatches.length, affectedIds: dnMatches.map(d => d.id) },
      { label: `Billing (WB) ${includeWB ? '— จะเปลี่ยน' : '— ข้าม'}`,         count: wbMatches.length, affectedIds: wbMatches.map(b => b.id) },
      { label: `Tax Invoice (IV) ${includeIV ? '— จะเปลี่ยน' : '— ข้าม'}`,     count: ivMatches.length, affectedIds: ivMatches.map(t => t.id) },
    ]
  }, [sourceCode, targetCode, quotations, customers, deliveryNotes, billingStatements, taxInvoices, includeWB, includeIV])

  const totalAffected = stats.reduce((s, x) => s + x.count, 0)
  const canPreview = sourceCode && targetCode && sourceCode !== targetCode

  const execute = async () => {
    if (!canPreview) return
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
      if (deleteSource) {
        const deletedItem = linenCatalog.find(i => i.code === src)
        if (deletedItem) {
          undoChanges.push({ table: 'linen_items', id: src, op: 'delete', oldData: deletedItem as unknown as Record<string, unknown> })
        }
        deleteLinenItem(src)
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
              {sortedCatalog.map(i => (
                <option key={i.code} value={i.code}>{i.code} — {i.name}</option>
              ))}
            </select>
            {sourceItem && <p className="text-[11px] text-slate-500 mt-1">{sourceItem.name} · ราคา {sourceItem.defaultPrice}</p>}
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
              {sortedCatalog.filter(i => i.code !== sourceCode).map(i => (
                <option key={i.code} value={i.code}>{i.code} — {i.name}</option>
              ))}
            </select>
            {targetItem && <p className="text-[11px] text-slate-500 mt-1">{targetItem.name} · ราคา {targetItem.defaultPrice}</p>}
          </div>
        </div>

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
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={deleteSource} onChange={e => setDeleteSource(e.target.checked)}
              className="rounded border-slate-300" />
            ลบรหัสต้นทาง <strong>{sourceCode || '...'}</strong> ออกจาก catalog หลังรวมเสร็จ
          </label>
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
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fadeIn">
          <div className="fixed inset-0 bg-black/40" onClick={() => !running && setShowConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-slate-800">ยืนยันการรวมรหัส</h3>
                <p className="text-sm text-slate-600 mt-1">
                  รวม <code className="bg-slate-100 px-1.5 py-0.5 rounded">{sourceCode}</code> →{' '}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded">{targetCode}</code>
                </p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 mb-4 space-y-1">
              <div>• กระทบ <strong>{totalAffected}</strong> เอกสาร</div>
              {includeWB && <div className="text-amber-700">• รวม WB ที่ออกแล้วด้วย</div>}
              {includeIV && <div className="text-red-700">• รวม IV ที่ออกแล้วด้วย</div>}
              {deleteSource && <div>• ลบ {sourceCode} จาก catalog</div>}
            </div>
            <p className="text-xs text-slate-500 mb-4">
              ⚠ การรวมไม่สามารถ undo อัตโนมัติได้ — ตรวจสอบให้ถูกต้องก่อน
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
                className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 flex items-center gap-1.5"
              >
                {running ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังรวม...</> : 'ยืนยัน'}
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
