// 397 — QT accepted-scan client service (เรียก /api/qt-scan)
//   ไม่ compress: เอกสารตอบรับ = หลักฐานทางกฎหมาย เก็บไฟล์ต้นฉบับ · validate type/size ก่อนส่ง

const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf']
export const MAX_SCAN_BYTES = 10 * 1024 * 1024 // 10MB

function sessionUserId(): string {
  const s = typeof window !== 'undefined' ? sessionStorage.getItem('flowclean_session') : null
  return s ? JSON.parse(s)?.userId || '' : ''
}

/** validate ฝั่ง client ก่อนอัพ — คืน error string หรือ null ถ้าผ่าน */
export function validateScanFile(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return 'รองรับเฉพาะไฟล์ .jpg .png .pdf'
  if (file.size > MAX_SCAN_BYTES) return `ไฟล์ใหญ่เกิน 10MB (ไฟล์นี้ ${(file.size / 1024 / 1024).toFixed(1)}MB)`
  return null
}

/** อัพโหลด → คืน storage path */
export async function uploadQtScan(qtId: string, file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('qtId', qtId)
  const res = await fetch('/api/qt-scan', { method: 'POST', headers: { 'x-fc-session': sessionUserId() }, body: fd })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'อัพโหลดไม่สำเร็จ')
  return body.path as string
}

/** signed URL (หมดอายุ 5 นาที) สำหรับเปิดดู/ดาวน์โหลด */
export async function getQtScanUrl(path: string): Promise<string> {
  const res = await fetch(`/api/qt-scan?path=${encodeURIComponent(path)}`, { headers: { 'x-fc-session': sessionUserId() } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'เปิดไฟล์ไม่สำเร็จ')
  return body.url as string
}

/** ลบไฟล์ออกจาก storage */
export async function deleteQtScan(path: string): Promise<void> {
  const res = await fetch(`/api/qt-scan?path=${encodeURIComponent(path)}`, { method: 'DELETE', headers: { 'x-fc-session': sessionUserId() } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'ลบไม่สำเร็จ')
  }
}
