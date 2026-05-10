'use client'

/**
 * 188 ขั้น A — Sync Names Tool (admin only)
 * 190 Phase 1 — Promote Name to Catalog (reverse direction)
 * 193 — Orphan Codes section (Promote / Reassign / Ignore)
 * 197 — push undo snapshot ก่อน execute ทุก batch op
 */
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { useNameDrift, type DriftEntry } from '@/lib/use-name-drift'
import { useOrphanCodes, type OrphanEntry } from '@/lib/use-orphan-codes'
import { pushUndoAction, type SnapshotChange } from '@/lib/undo-stack'
import { blockNumberArrowKeys } from '@/lib/modal-nav'
import { getCodeReferences, detectConflict } from '@/lib/code-reference-check'
import CodeConflictWarning from '@/components/CodeConflictWarning'
import HoverPopover from '@/components/HoverPopover'
import { CheckCircle2, Loader2, RefreshCcw, AlertTriangle, ArrowRight, Zap, EyeOff, Eye, MoveRight, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { QuotationStatus, LinenItemDef } from '@/types'

const IGNORE_KEY = 'flowclean_orphan_ignore'

function loadIgnoreList(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(IGNORE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch { return new Set() }
}

function saveIgnoreList(list: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(IGNORE_KEY, JSON.stringify(Array.from(list)))
  } catch { /* ignore */ }
}

interface Props {
  /** รหัสที่อยากให้เลือกไว้ก่อนเปิด (จาก inline badge) */
  initialFocusCode?: string | null
}

export default function SyncNamesTool({ initialFocusCode }: Props) {
  const {
    quotations, updateQuotation, linenCatalog, addLinenItem,
    linenForms, updateLinenForm,
    deliveryNotes, updateDeliveryNote,
    customers, updateCustomer,
  } = useStore()
  const { driftMap, totalCodes, totalQts } = useNameDrift()
  const drifts = useMemo(() => Array.from(driftMap.values()).sort((a, b) => b.qts.length - a.qts.length), [driftMap])

  // 193: Orphan codes
  const { orphans } = useOrphanCodes()
  const [ignoreList, setIgnoreList] = useState<Set<string>>(() => loadIgnoreList())
  const [showIgnored, setShowIgnored] = useState(false)
  const visibleOrphans = useMemo(
    () => orphans.filter(o => showIgnored ? true : !ignoreList.has(o.code)),
    [orphans, ignoreList, showIgnored],
  )
  const ignoredCount = useMemo(() => orphans.filter(o => ignoreList.has(o.code)).length, [orphans, ignoreList])

  const toggleIgnore = (code: string) => {
    const next = new Set(ignoreList)
    if (next.has(code)) next.delete(code); else next.add(code)
    setIgnoreList(next); saveIgnoreList(next)
  }

  // 190 Phase 1: Promote state — รองรับทั้ง drift และ orphan
  const [promoteCtx, setPromoteCtx] = useState<{
    mode: 'drift' | 'orphan'
    sourceCode: string
    driftName: string  // ชื่อที่จะกลายเป็น catalog name
    sourceItem: LinenItemDef | undefined  // null ถ้า orphan
    matchingQts: { id: string; number: string; status: QuotationStatus; pricePerUnit: number }[]
  } | null>(null)

  // 193 + 201: Reassign state — รองรับทั้ง full code และ name-specific scope
  const [reassignCtx, setReassignCtx] = useState<{
    sourceCode: string
    nameFilter?: string  // ถ้ามี → ย้ายเฉพาะ QT.items ที่ name == nameFilter
    matchingQts: { id: string; number: string; status: QuotationStatus; nameInQT: string }[]
    /** 225: LF/DN counts (ใช้แสดงใน modal — reassign ทั้งหมดถ้าไม่มี nameFilter) */
    lfRowsCount?: number
    dnItemsCount?: number
    /** 226.A: Customer count */
    customerCount?: number
    /** 227: total QT count (ใช้ตรวจว่า per-name reassign เป็น last name ไหม) */
    totalQtCount?: number
  } | null>(null)

  const [includeAccepted, setIncludeAccepted] = useState(true)
  const [includeRejected, setIncludeRejected] = useState(false) // 191
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<{ codes: number; qts: number; ts: string } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  // เมื่อมี initialFocusCode → tick ให้เลย และ scroll ลงไปหา
  useEffect(() => {
    if (initialFocusCode && driftMap.has(initialFocusCode)) {
      setSelectedCodes(new Set([initialFocusCode]))
      setTimeout(() => {
        document.querySelector(`[data-drift-code="${initialFocusCode}"]`)?.scrollIntoView({
          behavior: 'smooth', block: 'center',
        })
      }, 50)
    }
  }, [initialFocusCode, driftMap])

  // 190: เปิด Promote modal สำหรับ drift name หนึ่ง
  const openPromote = (entry: DriftEntry, driftName: string) => {
    const sourceItem = linenCatalog.find(c => c.code === entry.code)
    // หา QT items ที่ match drift name + ดึง pricePerUnit ปัจจุบัน
    const matchingQts: { id: string; number: string; status: QuotationStatus; pricePerUnit: number }[] = []
    for (const q of entry.qts) {
      if (q.nameInQT !== driftName) continue
      const qt = quotations.find(qx => qx.id === q.id)
      if (!qt) continue
      const matchedItem = qt.items.find(it => it.code === entry.code && (it.name || '').trim() === driftName)
      if (!matchedItem) continue
      matchingQts.push({ id: qt.id, number: qt.quotationNumber, status: q.status, pricePerUnit: matchedItem.pricePerUnit })
    }
    setPromoteCtx({ mode: 'drift', sourceCode: entry.code, driftName, sourceItem, matchingQts })
  }

  // 193 + 199: Promote orphan
  // - ถ้าไม่ระบุ name → ใช้ name แรก (กรณีมีชื่อเดียวอยู่แล้ว)
  // - ถ้าระบุ name → split: เฉพาะ QT.items ที่ name นี้ ที่จะถูก promote
  //   ผู้ใช้เลือกได้: เก็บ source code (ครั้งแรก) หรือ สร้าง code ใหม่ (split ครั้งต่อไป)
  const openOrphanPromote = (entry: OrphanEntry, targetName?: string) => {
    const name = targetName ?? entry.names[0] ?? entry.code
    const matchingQts = entry.qts
      .filter(q => targetName ? q.nameInQT === targetName : true)
      .map(q => ({ id: q.id, number: q.number, status: q.status, pricePerUnit: q.pricePerUnit }))
    setPromoteCtx({
      mode: 'orphan',
      sourceCode: entry.code,
      driftName: name,
      sourceItem: undefined,
      matchingQts,
    })
  }

  // 193 + 225 + 226.A: Reassign — ย้าย code จาก orphan → catalog code อื่น (ครอบ QT + LF + DN + Customer)
  const openReassign = (entry: OrphanEntry) => {
    setReassignCtx({
      sourceCode: entry.code,
      matchingQts: entry.qts.map(q => ({ id: q.id, number: q.number, status: q.status, nameInQT: q.nameInQT })),
      lfRowsCount: entry.lfs.reduce((s, l) => s + l.rowsCount, 0),
      dnItemsCount: entry.dns.length,
      customerCount: entry.customers.length,
    })
  }

  // 201 + 227: Reassign per-name — ใช้กับ drift หรือ orphan ที่มีหลายชื่อ
  // 227 fix: ส่ง LF/DN/Customer counts มาด้วย — ถ้า matching QT = total QT → cascade
  const openReassignByName = (
    sourceCode: string,
    nameFilter: string,
    qts: { id: string; number: string; status: QuotationStatus; nameInQT: string }[],
    orphanEntry?: OrphanEntry,
  ) => {
    setReassignCtx({
      sourceCode,
      nameFilter,
      matchingQts: qts.filter(q => q.nameInQT === nameFilter),
      lfRowsCount: orphanEntry?.lfs.reduce((s, l) => s + l.rowsCount, 0),
      dnItemsCount: orphanEntry?.dns.length,
      customerCount: orphanEntry?.customers.length,
      totalQtCount: qts.length,
    })
  }

  const allowedStatuses = useMemo<Set<QuotationStatus>>(() => {
    const set = new Set<QuotationStatus>(['draft', 'sent'])
    if (includeAccepted) set.add('accepted')
    if (includeRejected) set.add('rejected')
    return set
  }, [includeAccepted, includeRejected])

  const countQtsForCode = (entry: DriftEntry) => entry.qts.filter(q => allowedStatuses.has(q.status)).length

  const selectedCount = selectedCodes.size
  const selectedQtCount = useMemo(() => {
    let n = 0
    for (const code of selectedCodes) {
      const e = driftMap.get(code)
      if (!e) continue
      n += countQtsForCode(e)
    }
    return n
  }, [selectedCodes, driftMap, allowedStatuses])

  const toggleSelect = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const selectAll = () => setSelectedCodes(new Set(drifts.map(d => d.code)))
  const clearAll = () => setSelectedCodes(new Set())

  const execute = async () => {
    setRunning(true)
    try {
      let qtTouched = 0
      const codesActuallyChanged = new Set<string>()
      const undoChanges: SnapshotChange[] = [] // 197

      // Build map: qtId → updates
      const qtUpdates = new Map<string, Map<string, string>>() // qtId → (code → newName)

      for (const code of selectedCodes) {
        const entry = driftMap.get(code)
        if (!entry) continue
        for (const q of entry.qts) {
          if (!allowedStatuses.has(q.status)) continue
          if (!qtUpdates.has(q.id)) qtUpdates.set(q.id, new Map())
          qtUpdates.get(q.id)!.set(code, entry.catalogName)
          codesActuallyChanged.add(code)
        }
      }

      // Apply
      for (const [qtId, codeToName] of qtUpdates.entries()) {
        const qt = quotations.find(q => q.id === qtId)
        if (!qt) continue
        // 197: snapshot oldData ก่อน update
        undoChanges.push({ table: 'quotations', id: qtId, op: 'update', oldData: { items: qt.items } })
        const newItems = qt.items.map(it =>
          codeToName.has(it.code) ? { ...it, name: codeToName.get(it.code)! } : it
        )
        updateQuotation(qtId, { items: newItems })
        qtTouched++
      }

      // 197: push undo
      if (undoChanges.length > 0) {
        pushUndoAction({
          type: 'sync_names',
          description: `Sync ${codesActuallyChanged.size} รหัส → ${qtTouched} QT`,
          meta: { codes: Array.from(codesActuallyChanged) },
          changes: undoChanges,
        })
      }

      setDone({ codes: codesActuallyChanged.size, qts: qtTouched, ts: new Date().toLocaleString('th-TH') })
      setShowConfirm(false)
      setSelectedCodes(new Set())
    } catch (err) {
      console.error('sync error:', err)
      alert('เกิดข้อผิดพลาดระหว่างซิงก์ — ดู console')
    } finally {
      setRunning(false)
    }
  }

  // 193 + 197 + 201 + 225: Reassign — ย้าย code → target catalog code ใน QT + LF + DN
  // ถ้า reassignCtx.nameFilter มีค่า → ย้ายเฉพาะ items ที่ name == nameFilter (QT only)
  const executeReassign = (targetCode: string, qtIds: Set<string>) => {
    if (!reassignCtx) return
    const undoChanges: SnapshotChange[] = []
    const nameFilter = reassignCtx.nameFilter
    let qtUpdated = 0
    let lfUpdated = 0
    let dnUpdated = 0
    const sourceCode = reassignCtx.sourceCode

    // 1. QT — ตามเดิม
    for (const qtId of qtIds) {
      const qt = quotations.find(q => q.id === qtId)
      if (!qt) continue
      undoChanges.push({ table: 'quotations', id: qtId, op: 'update', oldData: { items: qt.items } })
      const newItems = qt.items.map(it => {
        if (it.code !== sourceCode) return it
        if (nameFilter && (it.name || '').trim() !== nameFilter) return it
        return { ...it, code: targetCode }
      })
      updateQuotation(qtId, { items: newItems })
      qtUpdated++
    }

    let custUpdated = 0

    // 227: ถ้า per-name reassign — ตรวจว่าหลัง update QT แล้ว source code ยังมี QT อื่นใช้อยู่ไหม
    // ถ้าไม่มี (= last name ของ orphan นี้) → cascade ไป LF/DN/Customer เสมอ
    let shouldCascade = !nameFilter
    if (nameFilter) {
      const stillInOtherQT = quotations.some(q => {
        const isUpdated = qtIds.has(q.id)
        const items = isUpdated
          ? q.items.map(it =>
              it.code === sourceCode && (it.name || '').trim() === nameFilter
                ? { ...it, code: targetCode }
                : it,
            )
          : q.items
        return items.some(it => it.code === sourceCode)
      })
      shouldCascade = !stillInOtherQT
    }

    // 2. LF (225) + Customer (226.A) — cascade เมื่อ row-level OR per-name แต่เป็น last name
    if (shouldCascade) {
      for (const lf of linenForms) {
        const hasOrphan = (lf.rows || []).some(r => (r.code || '').trim() === sourceCode)
        if (!hasOrphan) continue
        undoChanges.push({ table: 'linen_forms', id: lf.id, op: 'update', oldData: { rows: lf.rows } })
        const newRows = lf.rows.map(r =>
          (r.code || '').trim() === sourceCode ? { ...r, code: targetCode } : r,
        )
        updateLinenForm(lf.id, { rows: newRows })
        lfUpdated++
      }

      // 3. DN (225) — reassign DN.items + priceSnapshot key
      for (const dn of deliveryNotes) {
        const hasOrphan = (dn.items || []).some(it => !it.isAdhoc && (it.code || '').trim() === sourceCode)
        if (!hasOrphan) continue
        undoChanges.push({
          table: 'delivery_notes', id: dn.id, op: 'update',
          oldData: { items: dn.items, priceSnapshot: dn.priceSnapshot },
        })
        const newItems = dn.items.map(it =>
          !it.isAdhoc && (it.code || '').trim() === sourceCode ? { ...it, code: targetCode } : it,
        )
        const newSnapshot = { ...(dn.priceSnapshot || {}) }
        if (sourceCode in newSnapshot) {
          // ถ้า target มี snapshot อยู่แล้วก็ไม่ overwrite — ใช้ของ target เพราะ targetCode = source of truth
          if (!(targetCode in newSnapshot)) {
            newSnapshot[targetCode] = newSnapshot[sourceCode]
          }
          delete newSnapshot[sourceCode]
        }
        updateDeliveryNote(dn.id, { items: newItems, priceSnapshot: newSnapshot })
        dnUpdated++
      }

      // 4. Customer (226.A) — rewrite enabledItems / priceList / priceHistory
      for (const c of customers) {
        const inEnabled = (c.enabledItems || []).includes(sourceCode)
        const inPriceList = (c.priceList || []).some(p => p.code === sourceCode)
        const inPriceHistory = (c.priceHistory || []).some(p => (p as unknown as { code?: string }).code === sourceCode)
        if (!inEnabled && !inPriceList && !inPriceHistory) continue

        undoChanges.push({
          table: 'customers', id: c.id, op: 'update',
          oldData: {
            enabledItems: c.enabledItems,
            priceList: c.priceList,
            priceHistory: c.priceHistory,
          },
        })
        const updates: Record<string, unknown> = {}
        if (inEnabled) {
          // dedup ถ้ามี target อยู่แล้ว
          updates.enabledItems = Array.from(new Set(
            (c.enabledItems || []).map(x => x === sourceCode ? targetCode : x),
          ))
        }
        if (inPriceList) {
          const hasTgt = c.priceList.some(p => p.code === targetCode)
          updates.priceList = hasTgt
            ? c.priceList.filter(p => p.code !== sourceCode)
            : c.priceList.map(p => p.code === sourceCode ? { ...p, code: targetCode } : p)
        }
        if (inPriceHistory) {
          updates.priceHistory = (c.priceHistory as unknown as Array<Record<string, unknown>>).map(p =>
            p.code === sourceCode ? { ...p, code: targetCode } : p,
          )
        }
        updateCustomer(c.id, updates)
        custUpdated++
      }
    }

    const totalUpdated = qtUpdated + lfUpdated + dnUpdated + custUpdated
    if (undoChanges.length > 0) {
      const parts: string[] = []
      if (qtUpdated > 0) parts.push(`${qtUpdated} QT`)
      if (lfUpdated > 0) parts.push(`${lfUpdated} LF`)
      if (dnUpdated > 0) parts.push(`${dnUpdated} DN`)
      if (custUpdated > 0) parts.push(`${custUpdated} Customer`)
      const desc = nameFilter
        ? `Reassign ${sourceCode} ("${nameFilter}") → ${targetCode} (${parts.join(' · ')})`
        : `Reassign ${sourceCode} → ${targetCode} (${parts.join(' · ')})`
      pushUndoAction({
        type: 'reassign_orphan',
        description: desc,
        meta: { from: sourceCode, to: targetCode, qtCount: qtUpdated, lfCount: lfUpdated, dnCount: dnUpdated, custCount: custUpdated, nameFilter },
        changes: undoChanges,
      })
    }
    setDone({ codes: 1, qts: totalUpdated, ts: new Date().toLocaleString('th-TH') })
    setReassignCtx(null)
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
        <RefreshCcw className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <strong>ซิงก์ชื่อรายการผ้าจาก catalog → QT</strong> — ใช้เมื่อแก้ชื่อใน &quot;รายการผ้า&quot; แล้ว
          QT เก่ายังเป็นชื่อเดิม
          <br />
          เครื่องมือนี้ <strong>ไม่</strong> แตะ price/code/items list — แค่อัปเดต <code className="bg-white/70 px-1 rounded">name</code> ของ items[]
          ในแต่ละ QT
          <br />
          <span className="text-xs text-blue-700">
            • ✅ ปลอดภัย: ใช้กับ QT status draft + sent (default)<br />
            • ⚠ ระวัง: ติ๊ก &quot;รวม accepted&quot; จะอัพเดต QT ที่มี SD ผ่านแล้ว — แต่ name ไม่กระทบ stock/billing<br />
            • ⚠ Historical: ติ๊ก &quot;รวม rejected&quot; จะแก้ QT ที่ถูกปฏิเสธแล้ว (ปกติไม่จำเป็น)<br />
            • ❌ ไม่แตะ: WB / IV (compliance documents)
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-slate-500">รหัสที่มี name drift</p>
          <p className="text-2xl font-bold text-[#1B3A5C]">{totalCodes}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">QT ที่กระทบ (รวมทุก status)</p>
          <p className="text-2xl font-bold text-[#1B3A5C]">{totalQts}</p>
        </div>
        <div className="flex flex-col gap-1.5 ml-auto">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={includeAccepted} onChange={e => setIncludeAccepted(e.target.checked)}
              className="rounded border-slate-300" />
            รวม QT ที่ <strong>accepted</strong> แล้ว
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={includeRejected} onChange={e => setIncludeRejected(e.target.checked)}
              className="rounded border-slate-300" />
            รวม QT ที่ <strong className="text-red-600">rejected</strong> (historical)
          </label>
        </div>
      </div>

      {totalCodes === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center text-emerald-700">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-600" />
          <p className="font-semibold">ไม่มี name drift</p>
          <p className="text-xs text-emerald-600 mt-1">ทุก QT ใช้ชื่อตรงกับ catalog แล้ว</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2 text-xs">
              <button onClick={selectAll} className="text-[#1B3A5C] hover:underline">เลือกทั้งหมด</button>
              <span className="text-slate-300">|</span>
              <button onClick={clearAll} className="text-slate-500 hover:underline">ล้าง</button>
              {selectedCount > 0 && (
                <span className="text-slate-500 ml-2">เลือก {selectedCount} รหัส · {selectedQtCount} QT</span>
              )}
            </div>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={selectedCount === 0 || selectedQtCount === 0}
              className="px-3 py-1.5 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 text-xs font-medium flex items-center gap-1.5"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              ซิงก์ที่เลือก ({selectedQtCount} QT)
            </button>
          </div>

          {/* List */}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-10 px-3 py-2"></th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อใน catalog (ใหม่)</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อเดิมใน QT (จะถูกแทนที่)</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600 w-32">จำนวน QT</th>
              </tr>
            </thead>
            <tbody>
              {drifts.map(d => {
                const qtCount = countQtsForCode(d)
                const checked = selectedCodes.has(d.code)
                return (
                  <tr key={d.code} data-drift-code={d.code}
                    className={cnRow(checked)}
                    onClick={() => toggleSelect(d.code)}>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={checked} readOnly className="rounded border-slate-300 pointer-events-none" />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{d.code}</td>
                    <td className="px-3 py-2 text-slate-800 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <ArrowRight className="w-3 h-3 text-emerald-500" />
                        {d.catalogName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {d.driftNames.map((n, i) => {
                        const matchCount = d.qts.filter(q => q.nameInQT === n).length
                        return (
                          <span key={i} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded mr-1 mb-0.5 text-xs">
                            {n}
                            <span className="text-amber-500">({matchCount})</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openPromote(d, n)
                              }}
                              title={`Promote: สร้าง code ใหม่จากชื่อนี้ + ย้าย ${matchCount} QT.items`}
                              className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded hover:bg-amber-200 text-amber-600 hover:text-amber-900"
                            >
                              <Zap className="w-3 h-3" />
                            </button>
                            {/* 201: Reassign per-name */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openReassignByName(d.code, n, d.qts.map(q => ({ id: q.id, number: q.number, status: q.status, nameInQT: q.nameInQT })))
                              }}
                              title={`Reassign: ย้าย ${matchCount} QT.items ที่มีชื่อนี้ → catalog code อื่น`}
                              className="inline-flex items-center justify-center w-4 h-4 rounded hover:bg-blue-200 text-blue-600 hover:text-blue-900"
                            >
                              <MoveRight className="w-3 h-3" />
                            </button>
                          </span>
                        )
                      })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(() => {
                        const cnt = { draft: 0, sent: 0, accepted: 0, rejected: 0 }
                        for (const q of d.qts) cnt[q.status]++
                        return (
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <span className="font-mono font-semibold text-slate-700">{qtCount}</span>
                            <span className="text-[9px] text-slate-400">/ {d.qts.length}</span>
                            <span className="ml-1 flex items-center gap-0.5 text-[9px]">
                              {cnt.draft > 0 && <span className="px-1 rounded bg-slate-100 text-slate-600" title="draft">D{cnt.draft}</span>}
                              {cnt.sent > 0 && <span className="px-1 rounded bg-blue-50 text-blue-700" title="sent">S{cnt.sent}</span>}
                              {cnt.accepted > 0 && <span className="px-1 rounded bg-emerald-50 text-emerald-700" title="accepted">A{cnt.accepted}</span>}
                              {cnt.rejected > 0 && <span className="px-1 rounded bg-red-50 text-red-700" title="rejected">R{cnt.rejected}</span>}
                            </span>
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fadeIn">
          <div className="fixed inset-0 bg-black/40" onClick={() => !running && setShowConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-slate-800">ยืนยันซิงก์ชื่อ</h3>
                <p className="text-sm text-slate-600 mt-1">
                  อัพเดต <strong>{selectedCount}</strong> รหัส · <strong>{selectedQtCount}</strong> QT
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              เครื่องมือนี้แก้เฉพาะ <code className="bg-slate-100 px-1 rounded">name</code> ของ items[] ใน QT —
              ไม่กระทบ price / code / stock / billing
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} disabled={running}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={execute} disabled={running}
                className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 flex items-center gap-1.5">
                {running ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังซิงก์...</> : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 193: Orphan codes section */}
      {orphans.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-red-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <h3 className="font-semibold text-sm text-red-800">
                🔴 Orphan Codes — {visibleOrphans.length} รหัส
              </h3>
              {ignoredCount > 0 && (
                <span className="text-xs text-slate-500">({ignoredCount} ซ่อน)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {ignoredCount > 0 && (
                <button onClick={() => setShowIgnored(s => !s)}
                  className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
                  {showIgnored ? <><EyeOff className="w-3 h-3" />ซ่อน ignored</> : <><Eye className="w-3 h-3" />ดู ignored</>}
                </button>
              )}
            </div>
          </div>
          <div className="px-4 py-2 bg-red-50/40 text-[11px] text-red-800 border-b border-red-100">
            รหัสที่อยู่ใน QT/LF/DN/Customer แต่ <strong>ไม่มีใน catalog</strong> — เลือก action ต่อแถว: Promote (เพิ่มเข้า catalog) · Reassign (ย้ายไป code อื่น ครอบ QT+LF+DN+Customer) · Ignore (ซ่อน)
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อที่เจอ</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600 w-44">source</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600 w-24">avg ราคา</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600 w-72">action</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrphans.map(o => {
                const isIgnored = ignoreList.has(o.code)
                return (
                  <tr key={o.code} className={`border-t border-slate-100 ${isIgnored ? 'opacity-50' : 'hover:bg-slate-50'}`}>
                    <td className="px-3 py-2 font-mono text-xs align-top">{o.code}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {o.names.length === 0 ? <span className="text-slate-400">(no name)</span> : o.names.map((n, i) => {
                        const matchCount = o.qts.filter(q => q.nameInQT === n).length
                        return (
                          <span key={i} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded mr-1 mb-0.5 text-xs">
                            {n}
                            <span className="text-amber-500">({matchCount})</span>
                            {/* 199: ⚡ promote per name — split case */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openOrphanPromote(o, n) }}
                              title={o.names.length > 1
                                ? `Split: สร้าง code ใหม่จากชื่อนี้ + ย้าย ${matchCount} QT.items มา code ใหม่`
                                : `Promote: สร้าง catalog item ${o.code} ด้วยชื่อนี้`
                              }
                              className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded hover:bg-amber-200 text-amber-600 hover:text-amber-900"
                            >
                              <Zap className="w-3 h-3" />
                            </button>
                            {/* 201: 🔄 Reassign per-name */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openReassignByName(o.code, n, o.qts.map(q => ({ id: q.id, number: q.number, status: q.status, nameInQT: q.nameInQT })), o) }}
                              title={`Reassign: ย้าย ${matchCount} QT.items ที่มีชื่อนี้ → catalog code อื่น`}
                              className="inline-flex items-center justify-center w-4 h-4 rounded hover:bg-blue-200 text-blue-600 hover:text-blue-900"
                            >
                              <MoveRight className="w-3 h-3" />
                            </button>
                          </span>
                        )
                      })}
                    </td>
                    <td className="px-3 py-2 text-right text-xs align-top">
                      <div className="inline-flex flex-col items-end gap-0.5">
                        {o.qts.length > 0 && (
                          <HoverPopover
                            trigger={
                              <span className="font-mono text-slate-700 cursor-help underline decoration-dotted decoration-slate-400">
                                QT {o.qts.length}
                              </span>
                            }
                            content={
                              <div>
                                <div className="font-semibold mb-1 text-slate-200">QT references (คลิกเพื่อเปิด)</div>
                                <ul className="space-y-1">
                                  {o.qts.slice(0, 20).map(q => (
                                    <li key={q.id} className="text-[11px]">
                                      <Link href={`/dashboard/billing?tab=quotation&openqt=${q.id}`}
                                        className="inline-flex items-center gap-1 font-mono text-cyan-300 hover:text-cyan-100 hover:underline">
                                        <ExternalLink className="w-3 h-3 opacity-70" />
                                        {q.number}
                                      </Link>
                                      <span className="ml-1 opacity-70">({q.status})</span>
                                      <span className="ml-1 opacity-90 block ml-4">&quot;{q.nameInQT || '—'}&quot;</span>
                                    </li>
                                  ))}
                                  {o.qts.length > 20 && (
                                    <li className="text-[10px] opacity-60 italic">+{o.qts.length - 20} อื่นๆ</li>
                                  )}
                                </ul>
                              </div>
                            }
                          />
                        )}
                        {o.lfs.length > 0 && (() => {
                          const byCust = new Map<string, number>()
                          for (const l of o.lfs) byCust.set(l.customerShortName, (byCust.get(l.customerShortName) || 0) + l.rowsCount)
                          return (
                            <HoverPopover
                              trigger={
                                <span className="font-mono text-blue-700 cursor-help underline decoration-dotted decoration-blue-300">
                                  LF {o.lfs.reduce((s, l) => s + l.rowsCount, 0)} ({byCust.size} ลค.)
                                </span>
                              }
                              content={
                                <div>
                                  <div className="font-semibold mb-1 text-slate-200">LF references — by customer</div>
                                  <ul className="space-y-0.5 mb-2">
                                    {Array.from(byCust.entries()).slice(0, 12).map(([cust, count]) => (
                                      <li key={cust} className="text-[11px]">
                                        <span className="text-cyan-300">{cust}</span>
                                        <span className="ml-1 opacity-70">({count} rows)</span>
                                      </li>
                                    ))}
                                    {byCust.size > 12 && <li className="text-[10px] opacity-60 italic">+{byCust.size - 12} ลค. อื่นๆ</li>}
                                  </ul>
                                  <div className="font-semibold text-slate-200 mb-1 mt-2 border-t border-slate-700 pt-1">LF forms (คลิกเพื่อเปิด)</div>
                                  <ul className="space-y-1">
                                    {o.lfs.slice(0, 30).map(l => (
                                      <li key={l.id} className="text-[10px]">
                                        <Link href={`/dashboard/linen-forms?detail=${l.id}`}
                                          className="inline-flex items-center gap-1 font-mono text-cyan-300 hover:text-cyan-100 hover:underline">
                                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                          {l.formNumber}
                                        </Link>
                                        <span className="ml-1 opacity-90">{l.customerShortName}</span>
                                        <span className="ml-1 opacity-60">· {l.rowsCount} rows · {l.date}</span>
                                      </li>
                                    ))}
                                    {o.lfs.length > 30 && <li className="text-[10px] opacity-60 italic">+{o.lfs.length - 30} ใบอื่นๆ</li>}
                                  </ul>
                                </div>
                              }
                            />
                          )
                        })()}
                        {o.dns.length > 0 && (() => {
                          const byCust = new Map<string, number>()
                          for (const d of o.dns) byCust.set(d.customerShortName, (byCust.get(d.customerShortName) || 0) + 1)
                          return (
                            <HoverPopover
                              trigger={
                                <span className="font-mono text-emerald-700 cursor-help underline decoration-dotted decoration-emerald-300">
                                  DN {o.dns.length} ({byCust.size} ลค.)
                                </span>
                              }
                              content={
                                <div>
                                  <div className="font-semibold mb-1 text-slate-200">DN references (คลิกเพื่อเปิด)</div>
                                  <ul className="space-y-1">
                                    {o.dns.slice(0, 30).map(d => (
                                      <li key={d.id} className="text-[10px]">
                                        <Link href={`/dashboard/delivery?detail=${d.id}`}
                                          className="inline-flex items-center gap-1 font-mono text-cyan-300 hover:text-cyan-100 hover:underline">
                                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                          {d.noteNumber}
                                        </Link>
                                        <span className="ml-1 opacity-90">{d.customerShortName}</span>
                                        <span className="ml-1 opacity-60">· {d.quantity} ชิ้น</span>
                                      </li>
                                    ))}
                                    {o.dns.length > 30 && <li className="text-[10px] opacity-60 italic">+{o.dns.length - 30} อื่นๆ</li>}
                                  </ul>
                                </div>
                              }
                            />
                          )
                        })()}
                        {o.customers.length > 0 && (
                          <HoverPopover
                            trigger={
                              <span className="font-mono text-purple-700 cursor-help underline decoration-dotted decoration-purple-300">
                                Customer {o.customers.length}
                              </span>
                            }
                            content={
                              <div>
                                <div className="font-semibold mb-1 text-slate-200">Customer references (คลิกเพื่อเปิด)</div>
                                <ul className="space-y-1">
                                  {o.customers.slice(0, 30).map(c => (
                                    <li key={c.id} className="text-[11px]">
                                      <Link href={`/dashboard/customers?detail=${c.id}`}
                                        className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-100 hover:underline">
                                        <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                        {c.shortName}
                                      </Link>
                                      <span className="ml-1 opacity-70">({c.sources.join(', ')})</span>
                                    </li>
                                  ))}
                                  {o.customers.length > 30 && <li className="text-[10px] opacity-60 italic">+{o.customers.length - 30} อื่นๆ</li>}
                                </ul>
                              </div>
                            }
                          />
                        )}
                        <span className="text-[10px] text-slate-400">รวม {o.totalRows} rows</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 align-top">฿{o.avgPrice.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right align-top">
                      <div className="inline-flex gap-1">
                        {/* Promote ระดับ row — ใช้ name แรก (กรณีมีชื่อเดียว); ถ้าหลายชื่อใช้ ⚡ ที่ chip แทน */}
                        <button onClick={() => openOrphanPromote(o)}
                          disabled={o.names.length > 1}
                          className="px-2 py-1 text-[10px] bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-0.5"
                          title={o.names.length > 1
                            ? 'มีหลายชื่อ — ใช้ ⚡ ที่ชื่อแต่ละอันเพื่อ split'
                            : 'สร้าง catalog item ใหม่จากรหัสนี้'}>
                          <Zap className="w-3 h-3" />Promote
                        </button>
                        <button onClick={() => openReassign(o)}
                          className="px-2 py-1 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600 inline-flex items-center gap-0.5"
                          title="ย้ายไป catalog code อื่น">
                          <MoveRight className="w-3 h-3" />Reassign
                        </button>
                        <button onClick={() => toggleIgnore(o.code)}
                          className={`px-2 py-1 text-[10px] rounded inline-flex items-center gap-0.5 ${isIgnored ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          title={isIgnored ? 'ยกเลิก ignore' : 'ซ่อน — ไม่จัดการ'}>
                          <EyeOff className="w-3 h-3" />{isIgnored ? 'Unignore' : 'Ignore'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Done */}
      {done && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-emerald-700 font-semibold">ซิงก์เสร็จเรียบร้อย <span className="text-xs font-normal text-emerald-600">— {done.ts}</span></p>
            <p className="text-sm text-emerald-700 mt-0.5">{done.codes} รหัส · {done.qts} QT</p>
          </div>
        </div>
      )}

      {/* 190 Phase 1 + 193 + 197: Promote modal */}
      {promoteCtx && (
        <PromoteModal
          ctx={promoteCtx}
          existingCodes={new Set(linenCatalog.map(c => c.code))}
          onClose={() => setPromoteCtx(null)}
          onCommit={(newItem, qtUpdates) => {
            const undoChanges: SnapshotChange[] = []
            // 1. Add new catalog item
            addLinenItem(newItem)
            undoChanges.push({ table: 'linen_items', id: newItem.code, op: 'insert', newData: newItem as unknown as Record<string, unknown> })
            // 2. Update QT items.code:
            //    drift mode → ย้ายเสมอ
            //    orphan mode → ย้ายเฉพาะถ้า newCode ≠ sourceCode (split case)
            //    ถ้า orphan + newCode == sourceCode → แค่ insert catalog (QT valid อัตโนมัติ)
            const shouldMigrate = promoteCtx.mode === 'drift' || newItem.code !== promoteCtx.sourceCode
            if (shouldMigrate) {
              for (const qtId of qtUpdates) {
                const qt = quotations.find(q => q.id === qtId)
                if (!qt) continue
                undoChanges.push({ table: 'quotations', id: qtId, op: 'update', oldData: { items: qt.items } })
                const newItems = qt.items.map(it =>
                  it.code === promoteCtx.sourceCode && (it.name || '').trim() === promoteCtx.driftName
                    ? { ...it, code: newItem.code }
                    : it
                )
                updateQuotation(qtId, { items: newItems })
              }
            }
            // 197: push undo
            const isSplit = promoteCtx.mode === 'orphan' && newItem.code !== promoteCtx.sourceCode
            pushUndoAction({
              type: 'promote_name',
              description: isSplit
                ? `Split orphan ${promoteCtx.sourceCode} → ${newItem.code} ("${promoteCtx.driftName}", ${qtUpdates.length} QT)`
                : promoteCtx.mode === 'orphan'
                  ? `Promote orphan ${promoteCtx.sourceCode} ("${promoteCtx.driftName}") เข้า catalog`
                  : `Promote "${promoteCtx.driftName}" → ${newItem.code} (${qtUpdates.length} QT)`,
              meta: { mode: promoteCtx.mode, source: promoteCtx.sourceCode, target: newItem.code, split: isSplit },
              changes: undoChanges,
            })
            setPromoteCtx(null)
            setDone({ codes: 1, qts: qtUpdates.length, ts: new Date().toLocaleString('th-TH') })
          }}
        />
      )}

      {/* 193: Reassign modal */}
      {reassignCtx && (
        <ReassignModal
          ctx={reassignCtx}
          catalogCodes={linenCatalog}
          onClose={() => setReassignCtx(null)}
          onCommit={executeReassign}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 190 Phase 1 — Promote Name to Catalog modal
// ────────────────────────────────────────────────────────────────
interface PromoteCtx {
  mode: 'drift' | 'orphan'
  sourceCode: string
  driftName: string
  sourceItem: LinenItemDef | undefined
  matchingQts: { id: string; number: string; status: QuotationStatus; pricePerUnit: number }[]
}

function PromoteModal({
  ctx, existingCodes, onClose, onCommit,
}: {
  ctx: PromoteCtx
  existingCodes: Set<string>
  onClose: () => void
  onCommit: (newItem: LinenItemDef, qtIds: string[]) => void
}) {
  // 232: code conflict check — guard ก่อน promote ถ้า code มี ref เก่าค้าง
  const { quotations, linenForms, deliveryNotes, customers } = useStore()
  // Auto-suggest code:
  //   - orphan + source code ยังว่าง → ใช้ source code เดิม (1st promote)
  //   - drift หรือ source code ถูกใช้แล้ว (split case) → หาเลขถัดไป
  const suggestedCode = useMemo(() => {
    if (ctx.mode === 'orphan' && !existingCodes.has(ctx.sourceCode)) return ctx.sourceCode
    const prefixMatch = ctx.sourceCode.match(/^([A-Z]+)(\d+)/i)
    if (!prefixMatch) return `${ctx.sourceCode}_NEW`
    const [, prefix, numStr] = prefixMatch
    const padLen = numStr.length
    let n = parseInt(numStr, 10) + 1
    while (existingCodes.has(`${prefix}${String(n).padStart(padLen, '0')}`)) n++
    return `${prefix}${String(n).padStart(padLen, '0')}`
  }, [ctx.sourceCode, ctx.mode, existingCodes])

  // Default price: avg ของ pricePerUnit จาก matching QTs (skip 0)
  const suggestedPrice = useMemo(() => {
    const prices = ctx.matchingQts.map(m => m.pricePerUnit).filter(p => p > 0)
    if (prices.length === 0) return ctx.sourceItem?.defaultPrice || 0
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length
    return Math.round(avg * 100) / 100
  }, [ctx.matchingQts, ctx.sourceItem])

  const [newCode, setNewCode] = useState(suggestedCode)
  const [newName, setNewName] = useState(ctx.driftName)
  const [newPrice, setNewPrice] = useState(suggestedPrice)
  const [selectedQtIds, setSelectedQtIds] = useState<Set<string>>(new Set(ctx.matchingQts.map(q => q.id)))
  const [running, setRunning] = useState(false)
  const [confirmDespiteConflict, setConfirmDespiteConflict] = useState(false)

  // 232: ตรวจ code reference ที่ค้างอยู่ในระบบ + ดู conflict กับ name ที่ user จะใส่
  const codeRefs = useMemo(
    () => getCodeReferences(newCode.trim().toUpperCase(), { quotations, linenForms, deliveryNotes, customers }),
    [newCode, quotations, linenForms, deliveryNotes, customers],
  )
  const conflict = useMemo(() => detectConflict(codeRefs, newName), [codeRefs, newName])
  // ถ้า conflict = name_drift และ user ยังไม่ confirm → block submit
  const blockedByConflict = conflict === 'name_drift' && !confirmDespiteConflict

  const codeUpper = newCode.trim().toUpperCase()
  // Orphan mode: ใช้ source code เดิมได้ (เพราะมันยังไม่อยู่ใน catalog)
  const codeError = !codeUpper
    ? 'ระบุรหัสใหม่'
    : existingCodes.has(codeUpper)
      ? `รหัส "${codeUpper}" มีอยู่แล้วใน catalog`
      : (ctx.mode === 'drift' && codeUpper === ctx.sourceCode)
        ? 'รหัสใหม่ต้องไม่ตรงกับรหัสเดิม'
        : null

  const nameError = !newName.trim() ? 'ระบุชื่อ' : null
  // Orphan + same code: insert อย่างเดียว ไม่ต้อง QT selection
  // อื่นๆ (drift หรือ orphan-split): require QT selection
  const isInsertOnly = ctx.mode === 'orphan' && codeUpper === ctx.sourceCode
  const canSubmit = !codeError && !nameError && (isInsertOnly || selectedQtIds.size > 0) && !blockedByConflict

  const toggleQt = (id: string) => {
    setSelectedQtIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const submit = () => {
    if (!canSubmit) return
    setRunning(true)
    try {
      const newItem: LinenItemDef = {
        code: codeUpper,
        name: newName.trim(),
        nameEn: ctx.sourceItem?.nameEn || '',
        category: ctx.sourceItem?.category || 'other',
        unit: ctx.sourceItem?.unit || 'ชิ้น',
        defaultPrice: Number(newPrice) || 0,
        sortOrder: (ctx.sourceItem?.sortOrder || 0) + 1,
      }
      onCommit(newItem, Array.from(selectedQtIds))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[6vh] px-4 animate-fadeIn">
      <div className="fixed inset-0 bg-black/40" onClick={() => !running && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[88vh] overflow-auto">
        <div className="flex items-start gap-3 mb-4">
          <Zap className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              {ctx.mode === 'orphan' ? 'นำเข้า catalog' : 'Promote ชื่อเป็น code ใหม่'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {ctx.mode === 'orphan'
                ? <>สร้าง catalog item ใหม่จาก orphan code <code className="bg-white/70 px-1 rounded">{ctx.sourceCode}</code> — ใช้รหัสเดิมได้ ไม่ต้องย้าย QT</>
                : <>สร้าง catalog code ใหม่จากชื่อใน QT แล้วย้าย QT.items[].code ไป code ใหม่</>
              }
              <br />
              <span className="text-amber-700">⚠ ไม่แตะ SD/WB/IV — name ใน QT คงอยู่ตามที่เป็น</span>
            </p>
          </div>
        </div>

        {/* Source info */}
        <div className="bg-slate-50 rounded-lg p-3 mb-4 text-xs space-y-1 border border-slate-200">
          <div>
            <span className="text-slate-500">รหัสต้นทาง:</span>{' '}
            <code className="font-mono font-semibold text-slate-700">{ctx.sourceCode}</code>
            {ctx.mode === 'orphan'
              ? <span className="text-red-600 ml-1">(orphan — ยังไม่มีใน catalog)</span>
              : <span className="text-slate-500"> ({ctx.sourceItem?.name || '?'})</span>}
          </div>
          <div>
            <span className="text-slate-500">{ctx.mode === 'orphan' ? 'ชื่อที่พบใน QT:' : 'ชื่อใน QT (จะ promote):'}</span>{' '}
            <span className="font-semibold text-amber-700">{ctx.driftName}</span>
          </div>
          <div>
            <span className="text-slate-500">พบใน:</span>{' '}
            <span className="font-semibold text-slate-700">{ctx.matchingQts.length} QT.items</span>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              รหัสใหม่ <span className="text-slate-400">(suggest auto จาก prefix เดิม)</span>
            </label>
            <input
              value={newCode}
              onChange={e => setNewCode(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none ${codeError ? 'border-red-300' : 'border-slate-200'}`}
            />
            {codeError && <p className="text-xs text-red-600 mt-1">{codeError}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อรายการ</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none ${nameError ? 'border-red-300' : 'border-slate-200'}`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              ราคา default <span className="text-slate-400">(avg จาก {ctx.matchingQts.length} QT items)</span>
            </label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={newPrice}
              onChange={e => setNewPrice(Number(e.target.value))}
              onKeyDown={blockNumberArrowKeys}
              onFocus={e => e.currentTarget.select()}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
            />
          </div>

          {/* 232: Code conflict warning */}
          {!codeError && conflict !== 'no_refs' && (
            <CodeConflictWarning
              code={codeUpper}
              plannedName={newName}
              refs={codeRefs}
              conflict={conflict}
            />
          )}
          {conflict === 'name_drift' && (
            <label className="flex items-start gap-2 text-xs cursor-pointer p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <input type="checkbox" checked={confirmDespiteConflict}
                onChange={e => setConfirmDespiteConflict(e.target.checked)}
                className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-400" />
              <span className="text-amber-900">
                <strong>ฉันเข้าใจความเสี่ยง</strong> — จะ promote ต่อทั้งที่ทำให้เกิด name drift
                (จะ Reassign ref เก่าทีหลัง)
              </span>
            </label>
          )}
        </div>

        {/* QT selector:
            - drift mode → แสดง (เลือก QT ที่จะย้าย)
            - orphan mode + same code → ซ่อน (ไม่ต้องย้าย, แค่ insert catalog)
            - orphan mode + new code (split) → แสดง (เลือก QT.items ที่จะ split ออกไป) */}
        {(ctx.mode === 'drift' || codeUpper !== ctx.sourceCode) && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-600">QT ที่จะย้าย ({selectedQtIds.size}/{ctx.matchingQts.length})</label>
            <div className="flex gap-1.5 text-[11px]">
              <button onClick={() => setSelectedQtIds(new Set(ctx.matchingQts.map(q => q.id)))} className="text-[#1B3A5C] hover:underline">เลือกทั้งหมด</button>
              <span className="text-slate-300">|</span>
              <button onClick={() => setSelectedQtIds(new Set())} className="text-slate-500 hover:underline">ล้าง</button>
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg max-h-48 overflow-auto">
            {ctx.matchingQts.map(q => {
              const checked = selectedQtIds.has(q.id)
              return (
                <label key={q.id} className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 last:border-0 cursor-pointer text-xs ${checked ? 'bg-amber-50/40' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleQt(q.id)} className="rounded border-slate-300" />
                  <span className="font-mono text-slate-600">{q.number}</span>
                  <span className="text-slate-500">{q.status}</span>
                  <span className="ml-auto text-slate-600">฿{q.pricePerUnit.toLocaleString()}</span>
                </label>
              )
            })}
          </div>
        </div>
        )}

        {/* Confirm */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 mb-4 flex gap-2">
          <ArrowRight className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            {isInsertOnly ? (
              <>สร้าง <code className="bg-white/70 px-1 rounded">{codeUpper}</code> ใน catalog · QT ที่ใช้ {ctx.sourceCode} อยู่แล้วจะ valid ทันที</>
            ) : (
              <>สร้าง <code className="bg-white/70 px-1 rounded">{codeUpper}</code> ใน catalog
              + ย้าย <strong>{selectedQtIds.size}</strong> QT.items[] (name = &quot;{ctx.driftName}&quot;) จาก{' '}
              <code className="bg-white/70 px-1 rounded">{ctx.sourceCode}</code> →{' '}
              <code className="bg-white/70 px-1 rounded">{codeUpper}</code></>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={running}
            className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50">
            ยกเลิก
          </button>
          <button onClick={submit} disabled={!canSubmit || running}
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1.5">
            {running ? <><Loader2 className="w-4 h-4 animate-spin" />กำลัง Promote...</> : <><Zap className="w-4 h-4" />Promote</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function cnRow(checked: boolean) {
  const base = 'border-t border-slate-100 cursor-pointer transition-colors'
  return checked ? `${base} bg-blue-50/60 hover:bg-blue-50` : `${base} hover:bg-slate-50`
}

// ────────────────────────────────────────────────────────────────
// 193 — ReassignModal: ย้าย QT.items.code จาก orphan → catalog code อื่น
// ────────────────────────────────────────────────────────────────
function ReassignModal({
  ctx, catalogCodes, onClose, onCommit,
}: {
  ctx: {
    sourceCode: string; nameFilter?: string
    matchingQts: { id: string; number: string; status: QuotationStatus; nameInQT: string }[]
    lfRowsCount?: number
    dnItemsCount?: number
    customerCount?: number
    totalQtCount?: number
  }
  catalogCodes: LinenItemDef[]
  onClose: () => void
  onCommit: (targetCode: string, qtIds: Set<string>) => void
}) {
  const [targetCode, setTargetCode] = useState('')
  const [search, setSearch] = useState('')
  const [selectedQtIds, setSelectedQtIds] = useState<Set<string>>(new Set(ctx.matchingQts.map(q => q.id)))
  const [confirm, setConfirm] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return catalogCodes.slice(0, 50)
    return catalogCodes.filter(c =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    ).slice(0, 100)
  }, [catalogCodes, search])

  const target = catalogCodes.find(c => c.code === targetCode)
  // 225 + 226.A + 227: ปุ่ม commit เปิดได้ถ้ามี target + (มี QT เลือก หรือ มี LF/DN/Customer ให้ย้าย)
  const lfCount = ctx.lfRowsCount || 0
  const dnCount = ctx.dnItemsCount || 0
  const custCount = ctx.customerCount || 0
  // 227: per-name reassign จะ cascade LF/DN/Customer เมื่อ matching QT === total QT (last name)
  const totalQt = ctx.totalQtCount || ctx.matchingQts.length
  const isLastName = ctx.nameFilter ? selectedQtIds.size === totalQt && selectedQtIds.size > 0 : false
  const willCascade = !ctx.nameFilter || isLastName
  const hasNonQtSources = willCascade && (lfCount + dnCount + custCount) > 0
  const canCommit = !!target && (selectedQtIds.size > 0 || hasNonQtSources)
  const toggleQt = (id: string) => {
    setSelectedQtIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[6vh] px-4 animate-fadeIn">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[88vh] overflow-auto">
        <div className="flex items-start gap-3 mb-4">
          <MoveRight className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              {ctx.nameFilter ? 'Reassign per-name' : 'Reassign'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              ย้าย QT.items[].code จาก <code className="bg-slate-100 px-1 rounded">{ctx.sourceCode}</code>
              {ctx.nameFilter && <> (เฉพาะที่ name = <span className="font-semibold text-amber-700">&quot;{ctx.nameFilter}&quot;</span>)</>}
              {' '}→ catalog code อื่นที่มีอยู่
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 mb-4 text-xs space-y-1 border border-slate-200">
          <div>source code: <code className="font-mono font-semibold text-red-600">{ctx.sourceCode}</code></div>
          {ctx.nameFilter && (
            <div>scope filter: <span className="font-semibold text-amber-700">name = &quot;{ctx.nameFilter}&quot;</span></div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>QT.items ที่ตรง scope: <strong>{ctx.matchingQts.length} rows</strong></span>
            {willCascade && lfCount > 0 && <span className="text-blue-700">LF: <strong>{lfCount} rows</strong></span>}
            {willCascade && dnCount > 0 && <span className="text-emerald-700">DN: <strong>{dnCount} items</strong></span>}
            {willCascade && custCount > 0 && <span className="text-purple-700">Customer: <strong>{custCount} ราย</strong></span>}
          </div>
          {ctx.nameFilter && isLastName && (lfCount + dnCount + custCount > 0) && (
            <div className="text-[10px] text-emerald-700 italic mt-0.5 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
              ✨ <strong>Last name ของ {ctx.sourceCode}</strong> — จะ cascade LF/DN/Customer ตามไปด้วย → orphan code นี้ลบออกจาก list อัตโนมัติ
            </div>
          )}
          {ctx.nameFilter && !isLastName && (lfCount + dnCount + custCount > 0) && (
            <div className="text-[10px] text-amber-700 italic mt-0.5 bg-amber-50 px-2 py-1 rounded border border-amber-200">
              ⚠ Per-name split — LF/DN/Customer จะ <strong>คงไว้ที่ {ctx.sourceCode}</strong> รอ reassign name อื่นต่อ
            </div>
          )}
          {!ctx.nameFilter && (lfCount + dnCount + custCount > 0) && (
            <div className="text-[10px] text-slate-500 italic mt-0.5">
              💡 Reassign จะย้าย code ใน LF + DN + Customer (enabledItems/priceList/priceHistory) ทั้งหมด (auto)
            </div>
          )}
        </div>

        {/* Target search */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">เลือก catalog code ปลายทาง</label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="พิมพ์ค้นหา code หรือชื่อ"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none mb-2"
          />
          <div className="border border-slate-200 rounded-lg max-h-48 overflow-auto">
            {filtered.map(c => (
              <button key={c.code} type="button" onClick={() => setTargetCode(c.code)}
                className={`w-full text-left px-3 py-1.5 border-b border-slate-100 last:border-0 text-sm flex items-center gap-2 ${targetCode === c.code ? 'bg-blue-50 text-[#1B3A5C] font-medium' : 'hover:bg-slate-50'}`}>
                <code className="font-mono text-xs text-slate-500">{c.code}</code>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-3 text-xs text-slate-400 text-center">ไม่พบ</p>}
          </div>
        </div>

        {/* QT selector — แสดงเฉพาะมี QT */}
        {ctx.matchingQts.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-600">QT ที่จะ Reassign ({selectedQtIds.size}/{ctx.matchingQts.length})</label>
            <div className="flex gap-1.5 text-[11px]">
              <button onClick={() => setSelectedQtIds(new Set(ctx.matchingQts.map(q => q.id)))} className="text-[#1B3A5C] hover:underline">เลือกทั้งหมด</button>
              <span className="text-slate-300">|</span>
              <button onClick={() => setSelectedQtIds(new Set())} className="text-slate-500 hover:underline">ล้าง</button>
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg max-h-32 overflow-auto">
            {ctx.matchingQts.map(q => (
              <label key={q.id} className={`flex items-center gap-2 px-3 py-1 border-b border-slate-100 last:border-0 cursor-pointer text-xs ${selectedQtIds.has(q.id) ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}>
                <input type="checkbox" checked={selectedQtIds.has(q.id)} onChange={() => toggleQt(q.id)} className="rounded border-slate-300" />
                <span className="font-mono text-slate-600">{q.number}</span>
                <span className="text-slate-500">{q.status}</span>
                <span className="ml-auto text-slate-400 truncate">{q.nameInQT}</span>
              </label>
            ))}
          </div>
        </div>
        )}

        {target && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 mb-4">
            <ArrowRight className="w-3 h-3 inline mr-1" />
            ย้าย{' '}
            {selectedQtIds.size > 0 && <><strong>{selectedQtIds.size}</strong> QT </>}
            {willCascade && lfCount > 0 && <>{selectedQtIds.size > 0 ? '+ ' : ''}<strong>{lfCount}</strong> LF rows </>}
            {willCascade && dnCount > 0 && <>{(selectedQtIds.size > 0 || lfCount > 0) ? '+ ' : ''}<strong>{dnCount}</strong> DN items </>}
            {willCascade && custCount > 0 && <>{(selectedQtIds.size > 0 || lfCount > 0 || dnCount > 0) ? '+ ' : ''}<strong>{custCount}</strong> Customer </>}
            จาก{' '}
            <code className="bg-white/70 px-1 rounded">{ctx.sourceCode}</code> →{' '}
            <code className="bg-white/70 px-1 rounded">{target.code}</code> ({target.name})
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
            ยกเลิก
          </button>
          {!confirm ? (
            <button onClick={() => setConfirm(true)} disabled={!canCommit}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5">
              ดำเนินการ Reassign
            </button>
          ) : (
            <button onClick={() => onCommit(targetCode, selectedQtIds)}
              className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />ยืนยัน Reassign
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
