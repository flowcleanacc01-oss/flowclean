'use client'

/**
 * 242 — Ghost LF Cleanup
 *
 * Use case: ก่อน Feature 229 — MergeCodesTool ไม่แตะ LF rows
 *           → merge เก่า rewrite QT/DN/Customer แต่ LF rows ยังมี code ผี
 *           → carry-over compute เห็น code ผี → "ผี ค้างใน LF"
 *
 * Tool นี้: rewrite row.code ใน LF rows โดยตรง — ไม่กระทบ catalog
 *           รองรับ scope filter (customer + date range) เพื่อ limit เฉพาะ LF เก่า
 *           ที่มีผี โดยไม่ override LF ใหม่ที่ใช้ code เดียวกันเป็นความหมายอื่น (reuse case)
 *
 * Workflow: เลือก source code + scope → preview LF rows → เลือก target → execute
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { pushUndoAction, type SnapshotChange } from '@/lib/undo-stack'
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, Loader2, X, Users, Filter, Sparkles } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

export default function GhostLFCleanup() {
  const sp = useSearchParams()
  const {
    linenCatalog, customers, linenForms, updateLinenForm,
  } = useStore()

  // 242.1: prefill จาก URL (เปิดจาก Orphan Inspector / Reuse Detector)
  // ?ghostSource=A62 &ghostCustomers=id1,id2 &ghostDateTo=2026-01-31
  const urlSource = sp.get('ghostSource') || ''
  const urlCustomers = sp.get('ghostCustomers') || ''
  const urlDateTo = sp.get('ghostDateTo') || ''

  const [sourceCode, setSourceCode] = useState(urlSource)
  const [targetCode, setTargetCode] = useState('')
  const [scopeCustomerIds, setScopeCustomerIds] = useState<Set<string>>(
    () => new Set(urlCustomers ? urlCustomers.split(',').filter(Boolean) : [])
  )
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState(urlDateTo)
  const [showConfirm, setShowConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<{ count: number; ts: string } | null>(null)
  const prefilledRef = useState({ source: '', customers: '', dateTo: '' })[0]

  // sync URL → state เมื่อ URL เปลี่ยน (เคส user navigate ระหว่าง tools)
  useEffect(() => {
    if (urlSource && urlSource !== prefilledRef.source) {
      setSourceCode(urlSource)
      prefilledRef.source = urlSource
    }
    if (urlCustomers && urlCustomers !== prefilledRef.customers) {
      setScopeCustomerIds(new Set(urlCustomers.split(',').filter(Boolean)))
      prefilledRef.customers = urlCustomers
    }
    if (urlDateTo && urlDateTo !== prefilledRef.dateTo) {
      setDateTo(urlDateTo)
      prefilledRef.dateTo = urlDateTo
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSource, urlCustomers, urlDateTo])

  // ทุก code ที่อยู่ใน LF rows (รวม catalog + orphan + reuse-as-source-of-ghost)
  const allCodesInLF = useMemo(() => {
    const set = new Set<string>()
    for (const f of linenForms) {
      for (const r of f.rows || []) {
        if (r.code) set.add(r.code)
      }
    }
    return Array.from(set).sort()
  }, [linenForms])

  // Catalog ทั้งหมด (สำหรับ target dropdown)
  const sortedCatalog = useMemo(
    () => [...linenCatalog].sort((a, b) => a.code.localeCompare(b.code)),
    [linenCatalog],
  )

  // Sort customers (สำหรับ scope picker)
  const sortedCustomers = useMemo(
    () => [...customers].filter(c => c.isActive).sort((a, b) => a.shortName.localeCompare(b.shortName)),
    [customers],
  )

  // Preview — LF rows ที่ตรง source code + scope filter
  const preview = useMemo(() => {
    if (!sourceCode) return { lfs: [], totalRows: 0, customerBreakdown: new Map<string, number>(), dateMin: '', dateMax: '' }
    const matchingLFs: typeof linenForms = []
    const customerCount = new Map<string, number>()
    let totalRows = 0
    let dateMin = ''
    let dateMax = ''

    for (const f of linenForms) {
      // Customer scope filter
      if (scopeCustomerIds.size > 0 && !scopeCustomerIds.has(f.customerId)) continue
      // Date range filter
      if (dateFrom && f.date < dateFrom) continue
      if (dateTo && f.date > dateTo) continue
      // Has source code in rows?
      const matchingRows = (f.rows || []).filter(r => r.code === sourceCode)
      if (matchingRows.length === 0) continue
      matchingLFs.push(f)
      totalRows += matchingRows.length
      customerCount.set(f.customerId, (customerCount.get(f.customerId) || 0) + matchingRows.length)
      if (!dateMin || f.date < dateMin) dateMin = f.date
      if (!dateMax || f.date > dateMax) dateMax = f.date
    }
    return { lfs: matchingLFs, totalRows, customerBreakdown: customerCount, dateMin, dateMax }
  }, [linenForms, sourceCode, scopeCustomerIds, dateFrom, dateTo])

  const targetItem = linenCatalog.find(i => i.code === targetCode)
  const canExecute = sourceCode && targetCode && sourceCode !== targetCode && preview.lfs.length > 0

  // 242.1: Auto-suggest target — เทียบราคาที่ลูกค้า scope มี ในQT/priceList กับ catalog ปัจจุบัน
  const { quotations, deliveryNotes } = useStore()
  const suggestedTarget = useMemo(() => {
    if (!sourceCode) return null
    // ดึงราคาเฉลี่ยของ source code จากแหล่งต่างๆ (QT items + DN priceSnapshot + customer.priceList)
    const prices: number[] = []
    for (const q of quotations) {
      for (const it of q.items || []) {
        if (it.code === sourceCode && (it.pricePerUnit || 0) > 0) prices.push(it.pricePerUnit)
      }
    }
    for (const dn of deliveryNotes) {
      const snap = dn.priceSnapshot?.[sourceCode]
      if (snap && snap > 0) prices.push(snap)
    }
    for (const c of customers) {
      if (scopeCustomerIds.size > 0 && !scopeCustomerIds.has(c.id)) continue
      for (const p of c.priceList || []) {
        if (p.code === sourceCode && (p.price || 0) > 0) prices.push(p.price)
      }
    }
    if (prices.length === 0) return null
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length
    // หา catalog ที่ราคาใกล้สุด (±20%)
    const candidates = linenCatalog
      .filter(i => i.code !== sourceCode && i.defaultPrice > 0)
      .map(i => ({
        item: i,
        diff: Math.abs(i.defaultPrice - avg),
        pct: Math.abs(i.defaultPrice - avg) / Math.max(i.defaultPrice, 0.01),
      }))
      .filter(c => c.pct <= 0.2)
      .sort((a, b) => a.diff - b.diff)
    if (candidates.length === 0) return null
    const top = candidates[0]
    const confidence: 'high' | 'medium' = top.pct <= 0.05 ? 'high' : 'medium'
    return { code: top.item.code, name: top.item.name, price: top.item.defaultPrice, avgFound: Math.round(avg * 100) / 100, confidence }
  }, [sourceCode, quotations, deliveryNotes, customers, scopeCustomerIds, linenCatalog])

  const toggleCustomer = (id: string) => {
    setScopeCustomerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearScope = () => setScopeCustomerIds(new Set())

  const handleExecute = async () => {
    if (!canExecute) return
    setRunning(true)
    try {
      const undoChanges: SnapshotChange[] = []
      let rowsRewritten = 0

      for (const f of preview.lfs) {
        undoChanges.push({ table: 'linen_forms', id: f.id, op: 'update', oldData: { rows: f.rows } })
        const newRows = f.rows.map(r => {
          if (r.code === sourceCode) {
            rowsRewritten++
            return { ...r, code: targetCode }
          }
          return r
        })
        updateLinenForm(f.id, { rows: newRows })
      }

      if (undoChanges.length > 0) {
        pushUndoAction({
          type: 'merge_codes',
          description: `Ghost LF Cleanup: ${sourceCode} → ${targetCode} (${preview.lfs.length} LF, ${rowsRewritten} rows)`,
          changes: undoChanges,
        })
      }

      setDone({ count: rowsRewritten, ts: new Date().toISOString() })
      setShowConfirm(false)
      // Reset form for next cleanup
      setSourceCode('')
      setTargetCode('')
      setScopeCustomerIds(new Set())
      setDateFrom('')
      setDateTo('')
    } catch (err) {
      console.error('ghost cleanup error:', err)
      alert('เกิดข้อผิดพลาด — ดู console')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-amber-800">Ghost LF Cleanup</div>
            <div className="text-xs text-amber-700 mt-1">
              ลบ &quot;ผี&quot; (code ค้างใน LF rows ก่อน Feature 229) — rewrite row.code โดยตรง · ไม่กระทบ catalog
            </div>
            <div className="text-[11px] text-amber-600 mt-1.5">
              💡 ใช้ scope filter (customer + วันที่) เพื่อจำกัด LF ที่จะแก้ — กัน reuse case
              (เช่น A62 ปัจจุบัน=หมอนหนุน · LF เก่าของลูกค้า V = ผ้าปูเตียง → filter เฉพาะ V + ก่อนวันนี้)
            </div>
          </div>
        </div>
      </div>

      {/* Done banner */}
      {done && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ✓ Cleanup เสร็จ: rewrite {done.count} rows · ใช้ Undo Panel ใน Hygiene Center ถ้าต้องการย้อน
          <button onClick={() => setDone(null)} className="ml-auto text-emerald-600 hover:text-emerald-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        {/* Source + Target */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">รหัสต้นทาง (ผีใน LF)</label>
            <select
              value={sourceCode}
              onChange={e => setSourceCode(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">— เลือก code ใน LF —</option>
              {allCodesInLF.map(c => {
                const cat = linenCatalog.find(i => i.code === c)
                return (
                  <option key={c} value={c}>
                    {c}{cat ? ` — ${cat.name}` : ' — ⚠ orphan/no name'}
                  </option>
                )
              })}
            </select>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-400 mb-3 hidden sm:block" />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">รหัสปลายทาง</label>
            <select
              value={targetCode}
              onChange={e => setTargetCode(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">— เลือกรหัส catalog —</option>
              {sortedCatalog.filter(i => i.code !== sourceCode).map(i => (
                <option key={i.code} value={i.code}>{i.code} — {i.name}</option>
              ))}
            </select>
            {targetItem && <p className="text-[11px] text-slate-500 mt-1">{targetItem.name} · ราคา {targetItem.defaultPrice}</p>}
          </div>
        </div>

        {/* 242.1: Auto-suggest target — เทียบราคา source ใน scope กับ catalog */}
        {suggestedTarget && targetCode !== suggestedTarget.code && (
          <div className={cn(
            'flex items-center justify-between gap-3 p-2.5 rounded-lg border',
            suggestedTarget.confidence === 'high'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
          )}>
            <div className="flex items-center gap-2 text-xs">
              <Sparkles className={cn(
                'w-4 h-4',
                suggestedTarget.confidence === 'high' ? 'text-emerald-600' : 'text-amber-600'
              )} />
              <div>
                <span className={cn(
                  'font-semibold',
                  suggestedTarget.confidence === 'high' ? 'text-emerald-800' : 'text-amber-800'
                )}>
                  Suggested target: <span className="font-mono">{suggestedTarget.code}</span> — {suggestedTarget.name}
                </span>
                <span className={cn(
                  'ml-2',
                  suggestedTarget.confidence === 'high' ? 'text-emerald-600' : 'text-amber-700'
                )}>
                  (avg ราคาใน source = ฿{suggestedTarget.avgFound} · catalog = ฿{suggestedTarget.price})
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTargetCode(suggestedTarget.code)}
              className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap',
                suggestedTarget.confidence === 'high'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-amber-600 text-white hover:bg-amber-700'
              )}
            >
              ใช้ค่านี้
            </button>
          </div>
        )}

        {/* Scope: customer + date range */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Filter className="w-4 h-4" />
            Scope (จำกัด LF ที่จะแก้)
          </div>

          {/* Customer scope */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                ลูกค้า {scopeCustomerIds.size > 0 ? `(${scopeCustomerIds.size} ราย)` : '(ทั้งหมด)'}
              </label>
              {scopeCustomerIds.size > 0 && (
                <button onClick={clearScope} className="text-[11px] text-slate-500 hover:text-slate-700">
                  ล้าง
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-auto p-2 bg-slate-50 rounded-md border border-slate-200">
              {sortedCustomers.map(c => {
                const selected = scopeCustomerIds.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCustomer(c.id)}
                    className={cn(
                      'text-[11px] px-2 py-1 rounded-full border transition-colors',
                      selected
                        ? 'bg-[#1B3A5C] text-white border-[#1B3A5C]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-[#3DD8D8]'
                    )}
                  >
                    {c.shortName}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                LF ตั้งแต่
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                ถึงวันที่
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      {sourceCode && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-700">
            ผลลัพธ์: จะ rewrite {preview.totalRows} row ใน {preview.lfs.length} LF
          </div>

          {preview.lfs.length === 0 ? (
            <div className="text-xs text-slate-400 italic">ไม่มี LF ที่ตรง filter — ลองปรับ scope</div>
          ) : (
            <>
              {/* Date range */}
              {preview.dateMin && (
                <div className="text-xs text-slate-500">
                  LF ช่วงวันที่: {formatDate(preview.dateMin)} - {formatDate(preview.dateMax)}
                </div>
              )}

              {/* Customer breakdown */}
              <div className="text-xs">
                <div className="font-medium text-slate-600 mb-1">Breakdown by ลูกค้า:</div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(preview.customerBreakdown.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([cid, count]) => {
                      const c = customers.find(x => x.id === cid)
                      return (
                        <span key={cid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">
                          {c?.shortName || cid.slice(0, 8)} <span className="font-mono text-slate-500">×{count}</span>
                        </span>
                      )
                    })}
                </div>
              </div>

              {/* LF list (top 15) */}
              <div className="text-xs">
                <div className="font-medium text-slate-600 mb-1">LF ที่จะแก้ (top 15):</div>
                <div className="space-y-0.5 max-h-40 overflow-auto pr-2">
                  {preview.lfs.slice(0, 15).map(f => {
                    const c = customers.find(x => x.id === f.customerId)
                    const rowCount = (f.rows || []).filter(r => r.code === sourceCode).length
                    return (
                      <div key={f.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span className="font-mono">{f.formNumber}</span>
                        <span className="flex-1 truncate">{c?.shortName || ''}</span>
                        <span className="text-slate-500">{f.date}</span>
                        <span className="font-mono text-amber-600">×{rowCount}</span>
                      </div>
                    )
                  })}
                  {preview.lfs.length > 15 && (
                    <div className="text-[10px] text-slate-400 italic">+{preview.lfs.length - 15} LF อื่น</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Action button */}
          <button
            type="button"
            disabled={!canExecute || running}
            onClick={() => setShowConfirm(true)}
            className={cn(
              'w-full mt-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors',
              canExecute && !running
                ? 'bg-[#1B3A5C] text-white hover:bg-[#122740]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            )}
          >
            {running ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังทำ...
              </span>
            ) : canExecute ? (
              `Cleanup → ${sourceCode} → ${targetCode}`
            ) : (
              'เลือก source + target ก่อน'
            )}
          </button>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-semibold">ยืนยัน Ghost LF Cleanup</h3>
            </div>
            <div className="text-sm text-slate-700 space-y-2">
              <div>จะ rewrite row code <code className="bg-slate-100 px-1.5 py-0.5 rounded">{sourceCode}</code> → <code className="bg-slate-100 px-1.5 py-0.5 rounded">{targetCode}</code></div>
              <div className="text-xs text-slate-500">
                • {preview.lfs.length} LF · {preview.totalRows} rows<br />
                • ลูกค้า: {preview.customerBreakdown.size} ราย<br />
                • catalog ไม่ถูกแตะ (เฉพาะ LF rows)<br />
                • รองรับ Undo (7 วัน)
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                disabled={running}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleExecute}
                disabled={running}
                className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50"
              >
                {running ? 'กำลังทำ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
