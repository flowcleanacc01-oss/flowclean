// 368 — client helpers สำหรับ AI scan (ใช้ร่วม single LFAiInputModal + batch LFBatchScanModal)
// แยกออกมาเป็น util ตอน use ที่ 2 (กัน compressImage/extract drift)

import type { CustomerItemHint, ExtractedLF, LFExtractResponse, ExtractedChecklist, LFChecklistResponse } from './ai-extract-types'

export function sessionUserId(): string {
  try {
    const s = sessionStorage.getItem('flowclean_session')
    return s ? (JSON.parse(s)?.userId || '') : ''
  } catch {
    return ''
  }
}

// ย่อ + auto-orient ด้วย canvas (ไม่พึ่ง dependency) → JPEG base64
export async function compressImage(file: File): Promise<{ base64: string; dataUrl: string }> {
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

/** compress + POST /api/lf-extract → ExtractedLF (+ dataUrl preview) · throw ถ้า fail */
export async function extractSheet(
  file: File,
  items: CustomerItemHint[],
): Promise<{ data: ExtractedLF; dataUrl: string }> {
  if (!file.type.startsWith('image/')) throw new Error('ไฟล์ไม่ใช่รูปภาพ')
  const { base64, dataUrl } = await compressImage(file)
  const res = await fetch('/api/lf-extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-fc-session': sessionUserId() },
    body: JSON.stringify({ imageBase64: base64, mediaType: 'image/jpeg', items }),
  })
  const json: LFExtractResponse = await res.json()
  if (!json.ok || !json.data) throw new Error(json.error || 'สกัดข้อมูลไม่สำเร็จ')
  return { data: json.data, dataUrl }
}

/** 363 — สแกนใบเช็คผ้า (mode 'checklist') → ExtractedChecklist (per-bag) */
export async function extractChecklist(
  file: File,
  items: CustomerItemHint[],
): Promise<{ data: ExtractedChecklist; dataUrl: string }> {
  if (!file.type.startsWith('image/')) throw new Error('ไฟล์ไม่ใช่รูปภาพ')
  const { base64, dataUrl } = await compressImage(file)
  const res = await fetch('/api/lf-extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-fc-session': sessionUserId() },
    body: JSON.stringify({ imageBase64: base64, mediaType: 'image/jpeg', items, mode: 'checklist' }),
  })
  const json: LFChecklistResponse = await res.json()
  if (!json.ok || !json.data) throw new Error(json.error || 'สกัดข้อมูลไม่สำเร็จ')
  return { data: json.data, dataUrl }
}
