'use client'

// 368 — Batch Scan Wizard: อัปโหลดหลายใบทีเดียว → AI อ่านลูกค้า+วันที่+4 ช่อง
// → auto-match ลูกค้า → wizard ทีละใบ (next/next/done) → สร้าง LF ที่ 4/7 รวดเดียว
// ลดงาน: ไม่ต้องเปิด modal/พิมพ์ลูกค้า/วันที่ ทีละใบ

import { useState, useRef, useCallback } from 'react'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import { extractSheet } from '@/lib/ai-scan-client'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import type { CustomerItemHint, AiFillMap } from '@/lib/ai-extract-types'
import type { Customer } from '@/types'
import { Upload, Loader2, Sparkles, AlertTriangle, Check, RefreshCw, ImageOff, ChevronLeft, ChevronRight } from 'lucide-react'

interface ItemOpt { code: string; name: string }

interface EditRow {
  code: string
  name_raw: string
  col2: number | null
  col3: number | null
  col5: number | null
  col6: number | null
  confidence: number
}

interface BatchSheet {
  fileName: string
  preview: string
  customerId: string          // matched (แก้ได้)
  customerNameRaw: string      // AI อ่านได้
  date: string                 // detected ISO (แก้ได้)
  rows: EditRow[]
  warnings: string[]
  skip: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  customers: Customer[]
  /** code+name ทั้ง catalog — ใช้เป็น hint ให้ AI match code (ยังไม่รู้ลูกค้าตอนสแกน) */
  catalogHints: CustomerItemHint[]
  /** match ชื่อดิบ → customerId */
  matchCustomer: (nameRaw: string) => string
  /** items ของลูกค้า (จาก QT) สำหรับ dropdown + re-match code */
  itemsForCustomer: (custId: string) => ItemOpt[]
  /** มี LF ลูกค้านี้+วันที่นี้แล้วไหม (เตือนซ้ำ) */
  hasExistingLF: (custId: string, date: string) => boolean
  onComplete: (sheets: { customerId: string; date: string; fill: AiFillMap }[]) => void
}

type Phase = 'upload' | 'loading' | 'review'

function confidenceClass(c: number): string {
  if (c >= 0.8) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (c >= 0.5) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

// code ที่ valid สำหรับลูกค้า: ใช้ของ AI ถ้าอยู่ใน items · ไม่งั้น fuzzy ชื่อ · ไม่งั้นว่าง
function resolveCode(aiCode: string | null, nameRaw: string, items: ItemOpt[]): string {
  if (aiCode && items.some(i => i.code === aiCode)) return aiCode
  const m = items.find(i => matchesThaiQueryAnyField([i.name], nameRaw))
  return m?.code || ''
}

export default function LFBatchScanModal({
  open, onClose, customers, catalogHints, matchCustomer, itemsForCustomer, hasExistingLF, onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>('upload')
  const [sheets, setSheets] = useState<BatchSheet[]>([])
  const [cur, setCur] = useState(0)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [failCount, setFailCount] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setPhase('upload'); setSheets([]); setCur(0); setProgress({ done: 0, total: 0 }); setFailCount(0)
  }, [])
  const handleClose = () => { reset(); onClose() }

  const runBatch = useCallback(async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'))
    if (imgs.length === 0) return
    setPhase('loading'); setProgress({ done: 0, total: imgs.length }); setFailCount(0)
    const results: BatchSheet[] = []
    let fails = 0
    // sequential-ish แต่ไม่ block UI — เก็บ progress ทีละใบ (กัน browser cap จากการยิงพร้อมกันเยอะ)
    for (const file of imgs) {
      try {
        const { data, dataUrl } = await extractSheet(file, catalogHints)
        const custId = data.detected_customer ? matchCustomer(data.detected_customer) : ''
        const items = custId ? itemsForCustomer(custId) : []
        results.push({
          fileName: file.name,
          preview: dataUrl,
          customerId: custId,
          customerNameRaw: data.detected_customer || '',
          date: data.detected_date || '',
          warnings: data.warnings || [],
          skip: false,
          rows: data.rows.map(r => ({
            code: custId ? resolveCode(r.code, r.name_raw || '', items) : (r.code || ''),
            name_raw: r.name_raw || '',
            col2: r.col2_send, col3: r.col3_claim, col5: r.col5_countedIn, col6: r.col6_packSend,
            confidence: r.confidence ?? 0,
          })),
        })
      } catch {
        fails++
      }
      setProgress(p => ({ ...p, done: p.done + 1 }))
    }
    setFailCount(fails)
    setSheets(results)
    setCur(0)
    setPhase('review')
  }, [catalogHints, matchCustomer, itemsForCustomer])

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) runBatch(files)
  }

  const patchSheet = (idx: number, patch: Partial<BatchSheet>) =>
    setSheets(s => s.map((x, i) => i === idx ? { ...x, ...patch } : x))

  // เปลี่ยนลูกค้า → re-resolve code ของทุก row ตาม items ลูกค้าใหม่
  const changeCustomer = (idx: number, custId: string) => {
    const items = custId ? itemsForCustomer(custId) : []
    setSheets(s => s.map((x, i) => i === idx ? {
      ...x, customerId: custId,
      rows: x.rows.map(r => ({ ...r, code: custId ? resolveCode(r.code || null, r.name_raw, items) : r.code })),
    } : x))
  }

  const patchRow = (sIdx: number, rIdx: number, patch: Partial<EditRow>) =>
    setSheets(s => s.map((x, i) => i === sIdx ? { ...x, rows: x.rows.map((r, j) => j === rIdx ? { ...r, ...patch } : r) } : x))

  const finish = () => {
    const out: { customerId: string; date: string; fill: AiFillMap }[] = []
    for (const s of sheets) {
      if (s.skip || !s.customerId || !s.date) continue
      const fill: AiFillMap = {}
      for (const r of s.rows) {
        if (!r.code) continue
        const prev = fill[r.code]
        const add = (a: number | null, b: number | null) => a == null ? b : b == null ? a : a + b
        if (prev) { prev.col2 = add(prev.col2, r.col2); prev.col3 = add(prev.col3, r.col3); prev.col5 = add(prev.col5, r.col5); prev.col6 = add(prev.col6, r.col6) }
        else fill[r.code] = { col2: r.col2, col3: r.col3, col5: r.col5, col6: r.col6 }
      }
      out.push({ customerId: s.customerId, date: s.date, fill })
    }
    onComplete(out)
    handleClose()
  }

  const readyCount = sheets.filter(s => !s.skip && s.customerId && s.date).length
  const s = sheets[cur]

  return (
    <Modal open={open} onClose={handleClose} title="📷 นำเข้าหลายใบด้วย AI (Batch)" size="xl" closeLabel="cancel">
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />

      {phase === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            อัปโหลดใบส่งรับผ้าหลายใบพร้อมกัน → AI อ่าน <span className="font-medium text-[#1B3A5C]">ลูกค้า + วันที่ + 4 ช่อง</span> ให้อัตโนมัติ → ตรวจทีละใบ → สร้าง LF (สถานะ 4/7) รวดเดียว
          </p>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); runBatch(Array.from(e.dataTransfer.files || [])) }}
            className={cn('rounded-xl border-2 border-dashed p-10 text-center transition-colors', dragOver ? 'border-[#3DD8D8] bg-[#3DD8D8]/5' : 'border-slate-200')}
          >
            <Sparkles className="w-8 h-8 text-[#3DD8D8] mx-auto mb-3" />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#3DD8D8] text-[#1B3A5C] font-medium hover:bg-[#2bb8b8] transition-colors">
              <Upload className="w-4 h-4" /> เลือกรูปหลายใบ / ลากวาง
            </button>
            <p className="text-xs text-slate-400 mt-3">เลือกได้หลายไฟล์พร้อมกัน — ใบที่ AI อ่านชื่อ/วันที่ได้จะกรอกให้เลย</p>
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div className="py-10 text-center space-y-3">
          <Loader2 className="w-7 h-7 text-[#3DD8D8] animate-spin mx-auto" />
          <p className="text-sm text-slate-600">AI กำลังอ่าน {progress.done}/{progress.total} ใบ...</p>
          <div className="w-56 h-2 bg-slate-100 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-[#3DD8D8] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {phase === 'review' && sheets.length === 0 && (
        <div className="py-8 text-center space-y-4">
          <ImageOff className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm text-red-600">อ่านไม่สำเร็จทั้ง {failCount} ใบ</p>
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-[#1B3A5C] hover:bg-slate-50">
            <RefreshCw className="w-4 h-4" /> ลองใหม่
          </button>
        </div>
      )}

      {phase === 'review' && s && (
        <div className="space-y-3">
          {/* progress dots */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              {sheets.map((sh, i) => (
                <button key={i} type="button" onClick={() => setCur(i)}
                  className={cn('w-6 h-6 rounded text-[10px] font-medium border transition-colors',
                    i === cur ? 'bg-[#1B3A5C] text-white border-[#1B3A5C]'
                      : sh.skip ? 'bg-slate-100 text-slate-300 border-slate-200 line-through'
                      : (sh.customerId && sh.date) ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-300')}>
                  {i + 1}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">พร้อมสร้าง {readyCount}/{sheets.length}{failCount > 0 && ` · อ่านไม่ได้ ${failCount}`}</span>
          </div>

          {/* sheet card */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-3">
            <div className="flex items-start gap-3">
              {s.preview && <img src={s.preview} alt="preview" className="w-20 h-20 object-cover rounded-lg border border-slate-200 flex-shrink-0" />}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="text-slate-500">ลูกค้า {s.customerNameRaw && <span className="text-slate-400">(AI อ่าน: &quot;{s.customerNameRaw}&quot;)</span>}</span>
                  <select value={s.customerId} onChange={e => changeCustomer(cur, e.target.value)}
                    className={cn('w-full mt-0.5 text-sm border rounded px-2 py-1.5 focus:outline-none focus:border-[#3DD8D8] bg-white', s.customerId ? 'border-slate-200' : 'border-amber-300 bg-amber-50')}>
                    <option value="">— เลือกลูกค้า —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="text-slate-500">วันที่</span>
                  <input type="date" value={s.date} onChange={e => patchSheet(cur, { date: e.target.value })}
                    className={cn('w-full mt-0.5 text-sm border rounded px-2 py-1.5 focus:outline-none focus:border-[#3DD8D8]', s.date ? 'border-slate-200' : 'border-amber-300 bg-amber-50')} />
                </label>
              </div>
            </div>

            {s.customerId && s.date && hasExistingLF(s.customerId, s.date) && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> มี LF ของลูกค้านี้ + วันที่นี้อยู่แล้ว — สร้างจะได้ใบใหม่ (ตรวจซ้ำก่อน)
              </div>
            )}
            {s.warnings.length > 0 && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 space-y-0.5">
                {s.warnings.map((w, i) => <div key={i} className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 flex-shrink-0" />{w}</div>)}
              </div>
            )}

            {/* rows */}
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[34vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-slate-500">
                    <th className="text-left px-2 py-1.5 font-medium">อ่านได้</th>
                    <th className="text-left px-2 py-1.5 font-medium min-w-[130px]">จับคู่</th>
                    <th className="text-right px-2 py-1.5 font-medium w-14">ส่ง</th>
                    <th className="text-right px-2 py-1.5 font-medium w-14">เคลม</th>
                    <th className="text-right px-2 py-1.5 font-medium w-14">เข้า</th>
                    <th className="text-right px-2 py-1.5 font-medium w-14">แพค</th>
                    <th className="text-center px-2 py-1.5 font-medium w-12">มั่นใจ</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r, rIdx) => {
                    const opts = s.customerId ? itemsForCustomer(s.customerId) : catalogHints
                    return (
                      <tr key={rIdx} className={cn('border-t border-slate-100', !r.code && 'bg-slate-50/60')}>
                        <td className="px-2 py-1 text-slate-600 max-w-[110px] truncate" title={r.name_raw}>{r.name_raw || '—'}</td>
                        <td className="px-2 py-1">
                          <select value={r.code} onChange={e => patchRow(cur, rIdx, { code: e.target.value })}
                            className="w-full text-[11px] border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:border-[#3DD8D8]">
                            <option value="">— ไม่เติม —</option>
                            {opts.map(it => <option key={it.code} value={it.code}>{it.code} · {it.name}</option>)}
                          </select>
                        </td>
                        {(['col2', 'col3', 'col5', 'col6'] as const).map(col => (
                          <td key={col} className="px-1 py-1">
                            <input type="number" min={0} value={r[col] ?? ''} placeholder="—"
                              onChange={e => { const v = e.target.value; patchRow(cur, rIdx, { [col]: v === '' ? null : Math.max(0, parseInt(v, 10) || 0) }) }}
                              className="w-full text-right text-[11px] border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:border-[#3DD8D8]" />
                          </td>
                        ))}
                        <td className="px-1 py-1 text-center">
                          <span className={cn('inline-block text-[9px] px-1 py-0.5 rounded border', confidenceClass(r.confidence))}>{Math.round(r.confidence * 100)}%</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={s.skip} onChange={e => patchSheet(cur, { skip: e.target.checked })} />
              ข้ามใบนี้ (ไม่สร้าง LF)
            </label>
          </div>

          {/* nav */}
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => setCur(c => Math.max(0, c - 1))} disabled={cur === 0}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" /> ก่อนหน้า
            </button>
            <span className="text-xs text-slate-400">ใบ {cur + 1}/{sheets.length}</span>
            {cur < sheets.length - 1 ? (
              <button type="button" onClick={() => setCur(c => Math.min(sheets.length - 1, c + 1))}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors">
                ถัดไป <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" onClick={finish} disabled={readyCount === 0}
                className={cn('inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  readyCount > 0 ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-200 text-slate-400 cursor-not-allowed')}>
                <Check className="w-4 h-4" /> สร้างทั้งหมด ({readyCount})
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
