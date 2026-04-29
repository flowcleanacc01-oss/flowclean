'use client'

/**
 * 197 — Undo Panel
 *
 * แสดงรายการ action ที่เพิ่งทำ + ปุ่ม Undo
 * แสดงใน Hygiene Center
 */
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { useUndoStack, markUndone, type UndoAction, type SnapshotChange } from '@/lib/undo-stack'
import { History, RotateCcw, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { LinenItemDef, Quotation, Customer, DeliveryNote, BillingStatement, TaxInvoice } from '@/types'

const TYPE_LABEL: Record<UndoAction['type'], { label: string; color: string }> = {
  sync_names:       { label: 'Sync Names',       color: 'bg-amber-100 text-amber-700' },
  promote_name:     { label: 'Promote',          color: 'bg-orange-100 text-orange-700' },
  merge_codes:      { label: 'Merge Codes',      color: 'bg-purple-100 text-purple-700' },
  reassign_orphan:  { label: 'Reassign Orphan',  color: 'bg-blue-100 text-blue-700' },
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'เมื่อกี้'
  if (m < 60) return `${m} นาทีที่แล้ว`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`
  const d = Math.floor(h / 24)
  return `${d} วันที่แล้ว`
}

export default function UndoPanel() {
  const stack = useUndoStack()
  const {
    deleteLinenItem, addLinenItem,
    updateQuotation,
    updateCustomer,
    updateDeliveryNote,
    updateBillingStatement,
    updateTaxInvoice,
  } = useStore()
  const [running, setRunning] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  const restoreChange = (c: SnapshotChange) => {
    if (c.op === 'insert') {
      // เคยมีการ insert → ตอน undo ต้อง delete
      if (c.table === 'linen_items') deleteLinenItem(c.id)
      // tables อื่นใช้กับ insert แทบไม่มี — skip
    } else if (c.op === 'update' && c.oldData) {
      switch (c.table) {
        case 'linen_items':
          // restore catalog item
          // ใช้ addLinenItem เพราะเรา delete ไปแล้วใน insert undo (ไม่ใช่ case นี้)
          // กรณี update — ใช้ updateLinenItem... แต่ store ไม่ expose? ใช้ direct
          // ตรงนี้ใช้ deleteLinenItem + addLinenItem ก็ work
          deleteLinenItem(c.id)
          addLinenItem(c.oldData as unknown as LinenItemDef)
          break
        case 'quotations':
          updateQuotation(c.id, c.oldData as Partial<Quotation>)
          break
        case 'customers':
          updateCustomer(c.id, c.oldData as Partial<Customer>)
          break
        case 'delivery_notes':
          updateDeliveryNote(c.id, c.oldData as Partial<DeliveryNote>)
          break
        case 'billing_statements':
          updateBillingStatement(c.id, c.oldData as Partial<BillingStatement>)
          break
        case 'tax_invoices':
          updateTaxInvoice(c.id, c.oldData as Partial<TaxInvoice>)
          break
      }
    } else if (c.op === 'delete' && c.oldData) {
      // restore deleted item
      if (c.table === 'linen_items') addLinenItem(c.oldData as unknown as LinenItemDef)
    }
  }

  const performUndo = async (action: UndoAction) => {
    setRunning(action.id)
    try {
      // Apply ในลำดับ reverse
      for (const c of [...action.changes].reverse()) restoreChange(c)
      markUndone(action.id)
      setConfirmId(null)
      setDoneMsg(`✓ Undo เสร็จ: ${action.description}`)
      setTimeout(() => setDoneMsg(null), 4000)
    } catch (err) {
      console.error('undo error:', err)
      alert('Undo ผิดพลาด — ดู console')
    } finally {
      setRunning(null)
    }
  }

  if (stack.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 text-center text-sm text-slate-500">
        <History className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
        ยังไม่มีการกระทำที่จะ undo ได้
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {doneMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />{doneMsg}
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs text-slate-600">
          <History className="w-3.5 h-3.5" />
          <span>การกระทำล่าสุด ({stack.length}) — เก็บได้ 7 วัน, สูงสุด 50 รายการ · ใช้ได้เฉพาะ device นี้</span>
        </div>
        <ul className="divide-y divide-slate-100 max-h-72 overflow-auto">
          {stack.map(a => (
            <li key={a.id} className={`px-4 py-2.5 flex items-start gap-3 text-sm ${a.undone ? 'opacity-50' : ''}`}>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_LABEL[a.type].color} flex-shrink-0`}>
                {TYPE_LABEL[a.type].label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-slate-700 truncate">{a.description}</p>
                <p className="text-[11px] text-slate-400">{timeAgo(a.ts)} · {a.changes.length} record(s)</p>
              </div>
              {a.undone ? (
                <span className="text-[10px] text-slate-400 px-2 py-1">undone แล้ว</span>
              ) : confirmId === a.id ? (
                <div className="flex gap-1">
                  <button onClick={() => setConfirmId(null)}
                    className="text-[11px] px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200">
                    ไม่
                  </button>
                  <button onClick={() => performUndo(a)} disabled={running === a.id}
                    className="text-[11px] px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 inline-flex items-center gap-1">
                    {running === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                    Undo
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(a.id)}
                  className="text-[11px] px-2 py-1 text-[#1B3A5C] hover:bg-slate-100 rounded inline-flex items-center gap-1 flex-shrink-0">
                  <RotateCcw className="w-3 h-3" />Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
