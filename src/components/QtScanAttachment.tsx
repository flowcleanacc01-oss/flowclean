'use client'

// 397 — แนบ/ดู/ลบ เอกสารสแกนใบตอบรับ (ลายเซ็นลูกค้า) ของ QT
//   ไฟล์เก็บที่ Supabase Storage (private) · QT เก็บแค่ path · เปิดดูผ่าน signed URL

import { useState, useRef } from 'react'
import { useStore } from '@/lib/store'
import { uploadQtScan, getQtScanUrl, deleteQtScan, validateScanFile } from '@/lib/qt-scan-service'
import { formatDate } from '@/lib/utils'
import { Paperclip, Eye, Trash2, Upload, Loader2, CheckCircle2 } from 'lucide-react'
import type { Quotation } from '@/types'

export default function QtScanAttachment({ quotation }: { quotation: Quotation }) {
  const { updateQuotation } = useStore()
  const [busy, setBusy] = useState<'' | 'upload' | 'view' | 'delete'>('')
  const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const path = quotation.acceptedScanPath
  const has = !!path

  const pick = async (file: File) => {
    setErr('')
    const v = validateScanFile(file)
    if (v) { setErr(v); return }
    setBusy('upload')
    try {
      const oldPath = quotation.acceptedScanPath
      const newPath = await uploadQtScan(quotation.id, file)
      updateQuotation(quotation.id, { acceptedScanPath: newPath, acceptedScanUploadedAt: new Date().toISOString() })
      if (oldPath && oldPath !== newPath) deleteQtScan(oldPath).catch(() => {}) // ลบไฟล์เก่า (fire-and-forget)
    } catch (e) { setErr(e instanceof Error ? e.message : 'อัพโหลดไม่สำเร็จ') }
    setBusy('')
  }

  const view = async () => {
    if (!path) return
    setBusy('view'); setErr('')
    try { window.open(await getQtScanUrl(path), '_blank', 'noopener') }
    catch (e) { setErr(e instanceof Error ? e.message : 'เปิดไฟล์ไม่สำเร็จ') }
    setBusy('')
  }

  const remove = async () => {
    if (!path || !confirm('ลบเอกสารตอบรับที่แนบไว้?')) return
    setBusy('delete'); setErr('')
    try {
      await deleteQtScan(path)
      updateQuotation(quotation.id, { acceptedScanPath: undefined, acceptedScanUploadedAt: undefined })
    } catch (e) { setErr(e instanceof Error ? e.message : 'ลบไม่สำเร็จ') }
    setBusy('')
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
      <div className="flex items-center gap-2 flex-wrap">
        <Paperclip className="w-4 h-4 text-slate-500 flex-shrink-0" />
        <span className="text-sm font-medium text-slate-700">เอกสารตอบรับ (ลายเซ็นลูกค้า)</span>
        {has ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
            <CheckCircle2 className="w-3 h-3" />แนบแล้ว
            {quotation.acceptedScanUploadedAt && <span className="text-emerald-600/70">· {formatDate(quotation.acceptedScanUploadedAt)}</span>}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">— ยังไม่ได้แนบ (.jpg/.png/.pdf ≤10MB)</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {has && (
            <button type="button" onClick={view} disabled={!!busy}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] disabled:opacity-50 font-medium">
              {busy === 'view' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}ดู/ดาวน์โหลด
            </button>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={!!busy}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50">
            {busy === 'upload' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}{has ? 'เปลี่ยนไฟล์' : 'แนบไฟล์'}
          </button>
          {has && (
            <button type="button" onClick={remove} disabled={!!busy}
              className="inline-flex items-center gap-1 px-1.5 py-1 text-xs rounded text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50" title="ลบไฟล์แนบ">
              {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-red-600 mt-1.5">{err}</p>}
    </div>
  )
}
