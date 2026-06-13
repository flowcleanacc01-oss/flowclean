// LINE alert builders (Phase A chunk 2) — pure (testable) · ไม่ยิง LINE/DB เอง
//   3 เช็ค: GPS ขาดสัญญาณ (433) · เอกสารรถใกล้หมด · ถึงรอบเซอร์วิส (PM)
//   แต่ละ alert มี key (dedup) + text (ข้อความ push) · cron กรอง key ที่เคยเตือนออก
import type { GpsPosition } from './v2x-types'
import { normalizePlate } from './v2x-types'
import type { Vehicle } from '@/types'
import { connStatus } from './gps-connection'

export interface LineAlert { key: string; text: string }

const DOC_TYPES: { field: keyof Vehicle; label: string }[] = [
  { field: 'insuranceExpiry', label: 'ประกัน' },
  { field: 'actExpiry', label: 'พ.ร.บ.' },
  { field: 'taxExpiry', label: 'ภาษีรถ' },
  { field: 'inspectionExpiry', label: 'ตรวจสภาพ' },
]
export const DOC_WARN_DAYS = 30   // เตือนล่วงหน้า ≤ 30 วัน
const DOC_OVERDUE_GRACE = 7       // เลยกำหนดยังเตือนได้อีก 7 วัน
export const PM_WARN_KM = 500     // ใกล้ถึงระยะเซอร์วิส ≤ 500 กม.

function fmtMin(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`
}

/** วันต่างจาก today ถึง iso (yyyy-mm-dd) · string math กัน TZ · null ถ้า parse ไม่ได้ */
function daysUntil(iso: string, today: string): number | null {
  const [y, m, d] = (iso || '').split('-').map(Number)
  const [ty, tm, td] = (today || '').split('-').map(Number)
  if (!y || !m || !d || !ty) return null
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000)
}

const carName = (v: Vehicle | undefined, fallback: string) => (v ? `คัน ${v.code}` : fallback)

/** 🚨 GPS ขาดสัญญาณระหว่างวัน (suspicious) — เตือนครั้งเดียวต่อคันต่อวัน */
export function buildGpsAlerts(positions: GpsPosition[], vehicles: Vehicle[], nowMs: number, todayTH: string): LineAlert[] {
  const byPlate = new Map(vehicles.map(v => [normalizePlate(v.licensePlate), v]))
  const out: LineAlert[] = []
  for (const p of positions) {
    const c = connStatus(p, nowMs)
    if (c.level !== 'suspicious') continue // เฉพาะ "ขาดระหว่างวัน" (ไม่เตือนจอดค้างคืน)
    const v = byPlate.get(p.plateNorm)
    out.push({
      key: `gps-offline:${p.plateNorm}:${todayTH}`,
      text: `🚨 GPS ขาดสัญญาณ — ${carName(v, p.plate)} (${p.plate}) ขาดมา ${fmtMin(c.offlineMin)} · เห็นล่าสุด ${c.lastSeen} · ควรตรวจ (อาจถูกถอด/ปิดอุปกรณ์)`,
    })
  }
  return out
}

/** 🚗 เอกสารรถใกล้หมด/เลยกำหนด */
export function buildDocAlerts(vehicles: Vehicle[], today: string): LineAlert[] {
  const out: LineAlert[] = []
  for (const v of vehicles) {
    if (!v.isActive) continue
    for (const { field, label } of DOC_TYPES) {
      const iso = (v[field] as string) || ''
      const d = daysUntil(iso, today)
      if (d === null || d > DOC_WARN_DAYS || d < -DOC_OVERDUE_GRACE) continue
      const when = d < 0 ? `⚠ เลยกำหนด ${-d} วัน` : d === 0 ? 'หมดวันนี้' : `อีก ${d} วัน`
      out.push({ key: `doc:${v.id}:${field}:${iso}`, text: `🚗 ${label} ${carName(v, v.licensePlate)} — ${when} (หมด ${iso})` })
    }
  }
  return out
}

/** 🔧 ถึง/ใกล้รอบเซอร์วิส (PM) จากเลขไมล์ */
export function buildPmAlerts(vehicles: Vehicle[]): LineAlert[] {
  const out: LineAlert[] = []
  for (const v of vehicles) {
    if (!v.isActive || !v.nextServiceOdometer || v.nextServiceOdometer <= 0) continue
    const remain = v.nextServiceOdometer - v.currentOdometer
    if (remain > PM_WARN_KM) continue
    const txt = remain <= 0 ? `⚠ เลยกำหนด ${(-remain).toLocaleString()} กม.` : `อีก ${remain.toLocaleString()} กม.`
    out.push({
      key: `pm:${v.id}:${v.nextServiceOdometer}`,
      text: `🔧 ถึงรอบเซอร์วิส คัน ${v.code} — ${txt} (กำหนดที่ ${v.nextServiceOdometer.toLocaleString()} · ตอนนี้ ${v.currentOdometer.toLocaleString()} กม.)`,
    })
  }
  return out
}

/** dedup key ที่หมดอายุ (gps-offline ของวันเก่า > 7 วัน) — กัน state โตไม่จำกัด */
export function pruneAlertKeys(keys: string[], todayTH: string): string[] {
  return keys.filter(k => {
    const m = k.match(/^gps-offline:.*:(\d{4}-\d{2}-\d{2})$/)
    if (!m) return true // doc/pm key (value-based) — เก็บไว้ จะหายเองเมื่อค่าเปลี่ยน
    const daysOld = -(daysUntil(m[1], todayTH) ?? 0) // วันนี้ − วันของ key (บวก = เก่ากว่า)
    return daysOld <= 7
  })
}
