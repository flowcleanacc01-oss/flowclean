'use client'

/**
 * 188 ขั้น A — Sync Names Tool (admin only)
 *
 * แสดงรหัสที่ catalog name ≠ QT name → ให้ admin sync name ใหม่ไปที่ QT
 *
 * Default scope: QT status=draft + sent (ปลอดภัย)
 * Optional toggle: รวม QT status=accepted (มี SD ผ่านแล้ว — แต่แค่ name ไม่ใช่ price)
 */
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { useNameDrift, type DriftEntry } from '@/lib/use-name-drift'
import { CheckCircle2, Loader2, RefreshCcw, AlertTriangle, ArrowRight } from 'lucide-react'
import type { QuotationStatus } from '@/types'

interface Props {
  /** รหัสที่อยากให้เลือกไว้ก่อนเปิด (จาก inline badge) */
  initialFocusCode?: string | null
}

export default function SyncNamesTool({ initialFocusCode }: Props) {
  const { quotations, updateQuotation } = useStore()
  const { driftMap, totalCodes, totalQts } = useNameDrift()
  const drifts = useMemo(() => Array.from(driftMap.values()).sort((a, b) => b.qts.length - a.qts.length), [driftMap])

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
        const newItems = qt.items.map(it =>
          codeToName.has(it.code) ? { ...it, name: codeToName.get(it.code)! } : it
        )
        updateQuotation(qtId, { items: newItems })
        qtTouched++
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
                      {d.driftNames.map((n, i) => (
                        <span key={i} className="inline-block bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded mr-1 mb-0.5 text-xs">
                          {n}
                        </span>
                      ))}
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
    </div>
  )
}

function cnRow(checked: boolean) {
  const base = 'border-t border-slate-100 cursor-pointer transition-colors'
  return checked ? `${base} bg-blue-50/60 hover:bg-blue-50` : `${base} hover:bg-slate-50`
}
