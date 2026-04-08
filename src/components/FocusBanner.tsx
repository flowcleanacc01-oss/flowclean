'use client'

import { Target, X } from 'lucide-react'

interface FocusBannerProps {
  /** จำนวนเอกสารที่กำลังโฟกัส */
  count: number
  /** เลขเอกสารทั้งหมด (ใช้แสดงสรุป 5 ใบแรก) */
  docNumbers?: string[]
  /** Type label (เช่น "ใบส่งของ", "ใบรับส่งผ้า") */
  docType: string
  /** Callback เมื่อ user คลิก "แสดงทั้งหมด" — ออกจากโฟกัสโหมด */
  onExit: () => void
}

/**
 * Reusable banner สำหรับ Focus Mode (50)
 *
 * แสดงเมื่อ user ถูก redirect มาจากการลบเอกสาร (เช่น ลบ WB → มา SD)
 * ระบบจะ override date filter ชั่วคราว → แสดงเฉพาะเอกสารที่เพิ่งปลดล็อค
 *
 * User กด "แสดงทั้งหมด" → ออกจากโฟกัส → กลับไป default date filter
 */
export default function FocusBanner({ count, docNumbers, docType, onExit }: FocusBannerProps) {
  const preview = docNumbers && docNumbers.length > 0
    ? (docNumbers.length <= 5
        ? docNumbers.join(', ')
        : `${docNumbers.slice(0, 5).join(', ')}, ...และอีก ${docNumbers.length - 5} ใบ`)
    : null

  return (
    <div className="bg-gradient-to-r from-[#3DD8D8]/10 to-blue-50 border border-[#3DD8D8] rounded-xl p-3 mb-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-[#3DD8D8]/20 flex items-center justify-center flex-shrink-0">
        <Target className="w-5 h-5 text-[#1B3A5C]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1B3A5C]">
          🎯 กำลังโฟกัส: {docType}ที่เพิ่งย้อนสถานะ ({count} ใบ)
        </p>
        {preview && (
          <p className="text-xs text-slate-600 mt-0.5 font-mono truncate">{preview}</p>
        )}
        <p className="text-[10px] text-slate-500 mt-1">
          ระบบ override date filter ชั่วคราว — แสดงเฉพาะเอกสารที่เพิ่งปลดล็อค
        </p>
      </div>
      <button onClick={onExit}
        className="px-3 py-1.5 text-xs bg-white text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200 flex items-center gap-1 flex-shrink-0">
        <X className="w-3 h-3" />
        แสดงทั้งหมด
      </button>
    </div>
  )
}
