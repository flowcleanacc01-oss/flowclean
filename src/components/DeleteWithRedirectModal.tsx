'use client'

import { useEffect } from 'react'
import { X, Trash2, ArrowRight, AlertTriangle } from 'lucide-react'

interface DeleteWithRedirectModalProps {
  open: boolean
  onClose: () => void
  /** ชื่อเอกสารที่จะลบ (เช่น "WB-202604-001") */
  docNumber: string
  /** ข้อความ confirm หลัก */
  message: string
  /** เอกสารที่เกี่ยวข้อง (ที่จะถูกปลดล็อค/หรือเตือน) */
  warning?: string
  /** ถ้ามี = แสดงปุ่ม "ลบ + ไปแก้ XX" */
  redirectLabel?: string
  /** Callback เมื่อกด "ลบ + อยู่หน้านี้" */
  onDeleteAndStay: () => void
  /** Callback เมื่อกด "ลบ + ไปแก้ XX" (ถ้ามี redirectLabel) */
  onDeleteAndRedirect?: () => void
  /** ถ้า true = ห้ามลบ (เช่น มีเอกสารต่อยอดอยู่) */
  blocked?: boolean
  blockedReason?: string
}

/**
 * Reusable modal สำหรับลบเอกสารพร้อมเลือก redirect (50.1, 50.2, 50.3)
 *
 * Pattern เดียวทุกหน้า — IV/WB/SD/LF
 *
 * Use case:
 * - User กำลังอยู่ที่หน้า X → คลิกลบเอกสาร
 * - Modal ถาม: "ลบ + อยู่หน้านี้" หรือ "ลบ + ไปแก้หน้าก่อนหน้า"
 * - ถ้าเลือก redirect → ระบบไปหน้าก่อนหน้าใน focus mode (?focus=)
 */
export default function DeleteWithRedirectModal(props: DeleteWithRedirectModalProps) {
  const {
    open, onClose, docNumber, message, warning, redirectLabel,
    onDeleteAndStay, onDeleteAndRedirect, blocked, blockedReason,
  } = props

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fadeIn">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-semibold text-slate-800">
              ลบเอกสาร <span className="font-mono text-[#1B3A5C]">{docNumber}</span>
            </h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3">
          {blocked ? (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-orange-800 flex gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">ไม่สามารถลบได้</p>
                <p className="text-sm">{blockedReason}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-700">{message}</p>
              {warning && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  ⚠ {warning}
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-white rounded-lg">
            ยกเลิก
          </button>
          {!blocked && (
            <>
              <button onClick={onDeleteAndStay}
                className="px-4 py-2 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded-lg flex items-center gap-1.5 font-medium">
                <Trash2 className="w-3.5 h-3.5" />
                ลบ + อยู่หน้านี้
              </button>
              {redirectLabel && onDeleteAndRedirect && (
                <button onClick={onDeleteAndRedirect}
                  className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg flex items-center gap-1.5 font-medium">
                  <Trash2 className="w-3.5 h-3.5" />
                  ลบ + {redirectLabel}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
