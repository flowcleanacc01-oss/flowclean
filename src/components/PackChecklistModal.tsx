'use client'

// 363 — Pack Checklist audit: สแกนใบเช็คผ้า (per-bag) → โค้ดบวก → col6 + เก็บ breakdown
// + audit เทียบกับ col6 ที่ LF มีอยู่ (จับ "บวกผิด/เขียนผิด" ที่เป็น pain รายวัน)
// รองรับหลายใบต่อ LF (แยกแผนก) → merge by code

import { useState, useRef, useCallback } from 'react'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import { extractChecklist } from '@/lib/ai-scan-client'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import type { CustomerItemHint } from '@/lib/ai-extract-types'
import { Upload, Loader2, Sparkles, AlertTriangle, Check, RefreshCw, ImageOff, Plus } from 'lucide-react'

interface ChecklistEditRow {
  code: string
  name_raw: string
  bags: number[]
  reference: number | null
  confidence: number
}

interface Props {
  open: boolean
  onClose: () => void
  items: CustomerItemHint[]                          // customer items (code matching)
  currentCol6: Record<string, number>                // col6 ปัจจุบันใน LF ต่อ code (audit ref)
  expectCustomer?: string                             // ชื่อลูกค้าของ LF (cross-check)
  expectDate?: string                                 // วันที่ LF (cross-check, ISO)
  onApply: (updates: { code: string; col6: number; breakdown: number[] }[]) => void
}

type Phase = 'upload' | 'loading' | 'review'

function confidenceClass(c: number): string {
  if (c >= 0.8) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (c >= 0.5) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}
const sum = (a: number[]) => a.reduce((s, n) => s + n, 0)

function resolveCode(aiCode: string | null, nameRaw: string, items: CustomerItemHint[]): string {
  if (aiCode && items.some(i => i.code === aiCode)) return aiCode
  return items.find(i => matchesThaiQueryAnyField([i.name], nameRaw))?.code || ''
}

export default function PackChecklistModal({ open, onClose, items, currentCol6, expectCustomer, expectDate, onApply }: Props) {
  const [phase, setPhase] = useState<Phase>('upload')
  const [rows, setRows] = useState<ChecklistEditRow[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [crossWarn, setCrossWarn] = useState<string[]>([])
  const [sheetCount, setSheetCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setPhase('upload'); setRows([]); setWarnings([]); setCrossWarn([]); setSheetCount(0); setErrorMsg('')
  }, [])
  const handleClose = () => { reset(); onClose() }

  const runScan = useCallback(async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'))
    if (imgs.length === 0) return
    setPhase('loading'); setErrorMsg('')
    try {
      const merged = new Map<string, ChecklistEditRow>()      // by code (rows ที่ match)
      const unmatched: ChecklistEditRow[] = []
      const warns: string[] = []
      const cross: string[] = []
      let ok = 0
      for (const file of imgs) {
        try {
          const { data } = await extractChecklist(file, items)
          ok++
          ;(data.warnings || []).forEach(w => warns.push(w))
          // cross-check ลูกค้า/วันที่ของใบ vs LF
          if (expectCustomer && data.detected_customer && !matchesThaiQueryAnyField([expectCustomer], data.detected_customer))
            cross.push(`ใบนี้อ่านลูกค้า "${data.detected_customer}" — LF คือ "${expectCustomer}" (ตรวจว่าใช่ใบเดียวกันไหม)`)
          if (expectDate && data.detected_date && data.detected_date !== expectDate)
            cross.push(`ใบนี้อ่านวันที่ ${data.detected_date} — LF คือ ${expectDate}`)
          for (const r of data.rows) {
            const code = resolveCode(r.code, r.name_raw || '', items)
            const bags = (r.bags || []).filter(n => typeof n === 'number' && n >= 0)
            const row: ChecklistEditRow = { code, name_raw: r.name_raw || '', bags, reference: r.reference, confidence: r.confidence ?? 0 }
            if (code && merged.has(code)) {
              merged.get(code)!.bags.push(...bags)   // หลายใบ/หลายถุง code เดียวกัน → รวมถุง
            } else if (code) {
              merged.set(code, row)
            } else {
              unmatched.push(row)
            }
          }
        } catch { /* ใบนี้อ่านไม่ได้ */ }
      }
      if (ok === 0) { setErrorMsg('อ่านใบเช็คผ้าไม่สำเร็จ'); setPhase('upload'); return }
      setRows([...merged.values(), ...unmatched])
      setWarnings(warns)
      setCrossWarn([...new Set(cross)])
      setSheetCount(ok)
      setPhase('review')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'); setPhase('upload')
    }
  }, [items, expectCustomer, expectDate])

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) runScan(files)
  }

  const patchRow = (idx: number, patch: Partial<ChecklistEditRow>) =>
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r))

  const apply = () => {
    const updates = rows
      .filter(r => r.code && r.bags.length > 0)
      .map(r => ({ code: r.code, col6: sum(r.bags), breakdown: r.bags }))
    onApply(updates)
    handleClose()
  }

  const applicable = rows.filter(r => r.code && r.bags.length > 0).length
  const mismatches = rows.filter(r => r.code && r.bags.length > 0 && sum(r.bags) !== (currentCol6[r.code] || 0)).length

  return (
    <Modal open={open} onClose={handleClose} title="📋 ตรวจใบเช็คผ้า (แพคส่ง)" size="xl" closeLabel="cancel">
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />

      {phase === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            อัปโหลดใบเช็คผ้าของ LF นี้ (หลายใบได้ถ้าแยกแผนก) → AI อ่าน <span className="font-medium text-[#1B3A5C]">จำนวนต่อถุง</span> → ระบบบวกให้ → เทียบกับ &quot;โรงซักแพคส่ง&quot; ที่กรอกไว้
          </p>
          {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); runScan(Array.from(e.dataTransfer.files || [])) }}
            className={cn('rounded-xl border-2 border-dashed p-10 text-center transition-colors', dragOver ? 'border-[#3DD8D8] bg-[#3DD8D8]/5' : 'border-slate-200')}
          >
            <Sparkles className="w-8 h-8 text-[#3DD8D8] mx-auto mb-3" />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#3DD8D8] text-[#1B3A5C] font-medium hover:bg-[#2bb8b8] transition-colors">
              <Upload className="w-4 h-4" /> เลือกใบเช็คผ้า / ลากวาง
            </button>
            <p className="text-xs text-slate-400 mt-3">รองรับหลายใบ (ผ้าขนหนู / ผ้าผืนใหญ่ / สปา) — ระบบรวมให้</p>
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div className="py-10 text-center space-y-2">
          <Loader2 className="w-7 h-7 text-[#3DD8D8] animate-spin mx-auto" />
          <p className="text-sm text-slate-500">AI กำลังอ่านใบเช็คผ้า + บวกต่อถุง...</p>
        </div>
      )}

      {phase === 'review' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">อ่าน {sheetCount} ใบ · จะอัปเดต <span className="font-semibold text-emerald-700">{applicable}</span> รายการ</span>
            {mismatches > 0
              ? <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300 font-medium">⚠ ยอดต่างจาก LF {mismatches} รายการ</span>
              : <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">ยอดตรงกับ LF</span>}
          </div>

          {crossWarn.length > 0 && (
            <div className="text-[11px] text-orange-800 bg-orange-50 border border-orange-300 rounded-lg px-2 py-1.5 space-y-0.5">
              {crossWarn.map((w, i) => <div key={i} className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 flex-shrink-0" />{w}</div>)}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 space-y-0.5">
              {warnings.slice(0, 4).map((w, i) => <div key={i} className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 flex-shrink-0" />{w}</div>)}
            </div>
          )}

          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[46vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-slate-500 text-xs">
                  <th className="text-left px-2 py-2 font-medium">อ่านได้</th>
                  <th className="text-left px-2 py-2 font-medium min-w-[140px]">จับคู่รายการ</th>
                  <th className="text-center px-2 py-2 font-medium min-w-[110px]">ต่อถุง (น้ำเงิน)</th>
                  <th className="text-right px-2 py-2 font-medium w-16">รวม</th>
                  <th className="text-right px-2 py-2 font-medium w-16">ใน LF</th>
                  <th className="text-center px-2 py-2 font-medium w-14"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const total = sum(r.bags)
                  const lfVal = r.code ? (currentCol6[r.code] || 0) : null
                  const mismatch = r.code && r.bags.length > 0 && total !== lfVal
                  return (
                    <tr key={idx} className={cn('border-t border-slate-100', !r.code && 'bg-slate-50/60')}>
                      <td className="px-2 py-1.5 text-slate-600 max-w-[110px] truncate" title={r.name_raw}>{r.name_raw || '—'}</td>
                      <td className="px-2 py-1.5">
                        <select value={r.code} onChange={e => patchRow(idx, { code: e.target.value })}
                          className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-[#3DD8D8]">
                          <option value="">— ไม่เติม —</option>
                          {items.map(it => <option key={it.code} value={it.code}>{it.code} · {it.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="text" inputMode="numeric"
                          value={r.bags.join('+')} placeholder="เช่น 43+36"
                          onChange={e => patchRow(idx, { bags: e.target.value.split('+').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0) })}
                          className="w-full text-center text-xs font-mono border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-[#3DD8D8]" />
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold text-[#1B3A5C]">{total}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{lfVal ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">
                        {r.code && r.bags.length > 0 && (
                          mismatch
                            ? <span className="text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300" title={`ต่าง ${total - (lfVal || 0)}`}>⚠</span>
                            : <span className="text-[10px] text-emerald-600">✓</span>
                        )}
                        {!r.code && <span className={cn('text-[9px] px-1 py-0.5 rounded border', confidenceClass(r.confidence))}>{Math.round(r.confidence * 100)}%</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400">
            ระบบบวก &quot;ต่อถุง&quot; ให้อัตโนมัติ → ลงช่อง <span className="font-medium">โรงซักแพคส่ง</span> + เก็บ breakdown ไว้ตรวจสอบ · ⚠ = ยอดที่บวกได้ต่างจากที่กรอกใน LF
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" /> สแกนใหม่
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-[#1B3A5C] border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> เพิ่มใบ
            </button>
            <button type="button" onClick={apply} disabled={applicable === 0}
              className={cn('inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                applicable > 0 ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-200 text-slate-400 cursor-not-allowed')}>
              <Check className="w-4 h-4" /> ลงยอดแพคส่ง ({applicable})
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
