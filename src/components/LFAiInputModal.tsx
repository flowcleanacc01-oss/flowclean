'use client'

// 358 / LF Input by AI (Phase 1) — upload/ถ่ายรูปใบนับ → AI สกัด → review → เติม LF
// auto-detect เขียนมือ/พิมพ์ · กล้องมือถือ + อัปโหลด · ตรวจ/แก้ก่อนเติมเสมอ

import { useState, useRef, useCallback } from 'react'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import type { CustomerItemHint, ExtractedLF, LFExtractResponse, AiFillMap } from '@/lib/ai-extract-types'
import { Camera, Upload, Loader2, Sparkles, AlertTriangle, Check, RefreshCw, ImageOff } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  items: CustomerItemHint[]
  onAccept: (fill: AiFillMap, filledCount: number) => void
}

interface EditRow {
  code: string          // '' = ไม่เติม
  name_raw: string
  col2: number
  col3: number
  confidence: number
}

type Phase = 'upload' | 'loading' | 'review' | 'error'

function sessionUserId(): string {
  try {
    const s = sessionStorage.getItem('flowclean_session')
    return s ? (JSON.parse(s)?.userId || '') : ''
  } catch {
    return ''
  }
}

// ย่อ + auto-orient ด้วย canvas (ไม่พึ่ง dependency) → JPEG base64
async function compressImage(file: File): Promise<{ base64: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  const maxDim = 2000
  let { width, height } = bitmap
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas not supported')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: dataUrl.split(',')[1], dataUrl }
}

function confidenceClass(c: number): string {
  if (c >= 0.8) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (c >= 0.5) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

export default function LFAiInputModal({ open, onClose, items, onAccept }: Props) {
  const [phase, setPhase] = useState<Phase>('upload')
  const [preview, setPreview] = useState<string | null>(null)
  const [editRows, setEditRows] = useState<EditRow[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [detectedDate, setDetectedDate] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setPhase('upload'); setPreview(null); setEditRows([]); setWarnings([]); setDetectedDate(null); setErrorMsg('')
  }, [])

  const handleClose = () => { reset(); onClose() }

  const extract = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setErrorMsg('กรุณาเลือกไฟล์รูปภาพ'); setPhase('error'); return }
    setPhase('loading'); setErrorMsg('')
    try {
      const { base64, dataUrl } = await compressImage(file)
      setPreview(dataUrl)
      const res = await fetch('/api/lf-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-fc-session': sessionUserId() },
        body: JSON.stringify({ imageBase64: base64, mediaType: 'image/jpeg', items }),
      })
      const json: LFExtractResponse = await res.json()
      if (!json.ok || !json.data) {
        setErrorMsg(json.error || 'สกัดข้อมูลไม่สำเร็จ'); setPhase('error'); return
      }
      const data: ExtractedLF = json.data
      const validCodes = new Set(items.map(i => i.code))
      setEditRows(data.rows.map(r => ({
        code: r.code && validCodes.has(r.code) ? r.code : '',
        name_raw: r.name_raw || '',
        col2: r.col2_send ?? 0,
        col3: r.col3_claim ?? 0,
        confidence: r.confidence ?? 0,
      })))
      setWarnings(data.warnings || [])
      setDetectedDate(data.detected_date || null)
      setPhase('review')
    } catch (e) {
      setErrorMsg(e instanceof Error && e.message ? e.message : 'อ่านรูปไม่สำเร็จ')
      setPhase('error')
    }
  }, [items])

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // reset เพื่อเลือกไฟล์เดิมซ้ำได้
    if (f) extract(f)
  }

  const accept = () => {
    const fill: AiFillMap = {}
    let count = 0
    for (const r of editRows) {
      if (!r.code) continue
      const prev = fill[r.code]
      if (prev) { prev.col2 += r.col2; prev.col3 += r.col3 }
      else { fill[r.code] = { col2: r.col2, col3: r.col3 }; count++ }
    }
    onAccept(fill, count)
    handleClose()
  }

  const fillableCount = editRows.filter(r => r.code).length

  return (
    <Modal open={open} onClose={handleClose} title="📷 กรอกใบนับด้วย AI" size="lg" closeLabel="cancel">
      {/* hidden inputs */}
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />

      {/* UPLOAD */}
      {phase === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            ถ่ายรูปหรืออัปโหลดใบนับผ้าของลูกค้า → AI จะอ่านรายการ + จำนวน แล้วให้ตรวจก่อนเติมลงฟอร์ม
          </p>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) extract(f) }}
            className={cn(
              'rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              dragOver ? 'border-[#3DD8D8] bg-[#3DD8D8]/5' : 'border-slate-200',
            )}
          >
            <Sparkles className="w-8 h-8 text-[#3DD8D8] mx-auto mb-3" />
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#3DD8D8] text-[#1B3A5C] font-medium hover:bg-[#2bb8b8] transition-colors"
              >
                <Camera className="w-4 h-4" /> ถ่ายรูป
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-[#1B3A5C] font-medium hover:bg-slate-50 transition-colors"
              >
                <Upload className="w-4 h-4" /> เลือกรูป / ลากวาง
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-3">รองรับ JPG / PNG / WebP — ภาพจะถูกย่อก่อนส่ง</p>
          </div>
          {items.length === 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> ยังไม่ได้เลือกลูกค้า — AI จะอ่านได้แต่จับคู่รหัสไม่ได้
            </p>
          )}
        </div>
      )}

      {/* LOADING */}
      {phase === 'loading' && (
        <div className="py-10 text-center">
          {preview && <img src={preview} alt="preview" className="max-h-40 mx-auto rounded-lg border border-slate-200 mb-4" />}
          <Loader2 className="w-7 h-7 text-[#3DD8D8] animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500">AI กำลังอ่านใบนับ...</p>
        </div>
      )}

      {/* ERROR */}
      {phase === 'error' && (
        <div className="py-8 text-center space-y-4">
          <ImageOff className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm text-red-600">{errorMsg}</p>
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-[#1B3A5C] hover:bg-slate-50">
            <RefreshCw className="w-4 h-4" /> ลองใหม่
          </button>
        </div>
      )}

      {/* REVIEW */}
      {phase === 'review' && (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            {preview && <img src={preview} alt="preview" className="w-24 h-24 object-cover rounded-lg border border-slate-200 flex-shrink-0" />}
            <div className="flex-1 text-sm">
              <p className="text-slate-600">AI สกัดได้ <span className="font-semibold text-[#1B3A5C]">{editRows.length}</span> แถว · จะเติม <span className="font-semibold text-emerald-700">{fillableCount}</span> รายการที่จับคู่รหัสได้</p>
              {detectedDate && <p className="text-xs text-slate-400 mt-0.5">วันที่ในรูป: {detectedDate}</p>}
              {warnings.length > 0 && (
                <div className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                  {warnings.map((w, i) => <div key={i} className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{w}</div>)}
                </div>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-slate-500 text-xs">
                  <th className="text-left px-2 py-2 font-medium">อ่านได้</th>
                  <th className="text-left px-2 py-2 font-medium min-w-[150px]">จับคู่รายการ</th>
                  <th className="text-right px-2 py-2 font-medium w-20">นับส่ง</th>
                  <th className="text-right px-2 py-2 font-medium w-20">เคลม</th>
                  <th className="text-center px-2 py-2 font-medium w-16">มั่นใจ</th>
                </tr>
              </thead>
              <tbody>
                {editRows.map((r, idx) => (
                  <tr key={idx} className={cn('border-t border-slate-100', !r.code && 'bg-slate-50/60')}>
                    <td className="px-2 py-1.5 text-slate-600 max-w-[120px] truncate" title={r.name_raw}>{r.name_raw || '—'}</td>
                    <td className="px-2 py-1.5">
                      <select
                        value={r.code}
                        onChange={e => setEditRows(rows => rows.map((x, i) => i === idx ? { ...x, code: e.target.value } : x))}
                        className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-[#3DD8D8] bg-white"
                      >
                        <option value="">— ไม่เติม —</option>
                        {items.map(it => <option key={it.code} value={it.code}>{it.code} · {it.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min={0} value={r.col2}
                        onChange={e => setEditRows(rows => rows.map((x, i) => i === idx ? { ...x, col2: Math.max(0, parseInt(e.target.value, 10) || 0) } : x))}
                        className="w-full text-right text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-[#3DD8D8]" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min={0} value={r.col3}
                        onChange={e => setEditRows(rows => rows.map((x, i) => i === idx ? { ...x, col3: Math.max(0, parseInt(e.target.value, 10) || 0) } : x))}
                        className="w-full text-right text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-[#3DD8D8]" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={cn('inline-block text-[10px] px-1.5 py-0.5 rounded border', confidenceClass(r.confidence))}>
                        {Math.round(r.confidence * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400">
            แถวสีเทา = ยังไม่จับคู่รหัส (เลือกจาก dropdown ถ้าต้องการเติม) · ตรวจตัวเลขก่อนยืนยันทุกครั้ง
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" /> ลองรูปใหม่
            </button>
            <button
              type="button"
              onClick={accept}
              disabled={fillableCount === 0}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                fillableCount > 0 ? 'bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8]' : 'bg-slate-200 text-slate-400 cursor-not-allowed',
              )}
            >
              <Check className="w-4 h-4" /> เติมลงฟอร์ม ({fillableCount})
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
