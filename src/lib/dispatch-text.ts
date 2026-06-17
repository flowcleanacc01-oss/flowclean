// 445 — สร้างข้อความแผนคิวรับ-ส่ง (work-night) สำหรับ copy ส่งไลน์ให้ทีม
//   pure (เทสได้) · จัดกลุ่มตามรอบ เรียงตาม "นาฬิกาคืนงาน" (รอบเช้ามืด/เช้า = วันถัดไป)
//   466 — แสดงเฉพาะลูกค้าที่ "มีคิวจริงในวันนั้น" (= มี chip · isScheduledDay + override) ไม่ใช่ membership รอบ
//       · ตัดวันงานที่ 15.30 เสมอ (รอบ ≥15.30 = คืนวันที่เลือก · <15.30 = เช้า/เช้ามืดวันถัดไป)
//   มาร์กเกอร์ดึงจาก schedule (445 กติกา): ทุกวัน→* (24) · ทุก N วัน→(N×24) · รายสัปดาห์/2สัปดาห์→* (วัน) · อื่นๆ→* (24)
import type { Round, Customer, ScheduleOverride } from '@/types'
import { isQueuedOnDate } from './schedule-audit'
import { effectiveRoundId } from './dispatch'

const PIVOT_MIN = 15 * 60 + 30 // 466 — 15.30 ตัดวันงาน

const THAI_DAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const SEP = '------------------------'
const HEADER_NOTE = 'คิว รถ ส่งรับ\n(ขึ้นรถ แต่ละรอบให้ จัดของย้อนขึ้น)'

function parseISO(iso: string): Date {
  const [y, m, d] = (iso || '').split('-').map(Number)
  return new Date(y || 2000, (m || 1) - 1, d || 1)
}
function shortBE(year: number): string {
  return String((year + 543) % 100).padStart(2, '0')
}

/** มาร์กเกอร์ท้ายชื่อจาก schedule ของลูกค้า (445 กติกา)
 *  ทุก N วัน→(N×24) เช่น ทุก 2 วัน→(48) · รายสัปดาห์/2สัปดาห์→* (วัน) · ทุกวัน+อื่นๆ→* (24) */
export function customerMarker(c: Customer): string {
  if (c.scheduleType === 'every_n_days' && c.scheduleEveryNDays && c.scheduleEveryNDays > 0) {
    return `(${c.scheduleEveryNDays * 24})`
  }
  if (c.scheduleType === 'weekly' || c.scheduleType === 'biweekly') return '* (วัน)'
  return '* (24)' // daily + none + undefined (ค่าเริ่มต้น)
}

/** hue 0–360 จาก hex (#rrggbb) · null ถ้า parse ไม่ได้ */
function hexToHue(hex?: string | null): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d === 0) return null // greyscale → ไม่มี hue
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

/** อิโมจิหัวใจตามสีรอบ (เลียนแบบที่ทีมใช้: เหลือง 💛 / ชมพู 🩷) */
export function roundHeart(hex?: string | null): string {
  const h = hexToHue(hex)
  if (h == null) return '🤍'
  if (h < 12 || h >= 330) return '🩷' // แดง/ชมพู
  if (h < 45) return '🧡'             // ส้ม
  if (h < 70) return '💛'             // เหลือง
  if (h < 160) return '💚'            // เขียว
  if (h < 250) return '💙'            // ฟ้า/น้ำเงิน
  if (h < 300) return '💜'            // ม่วง
  return '🩷'                          // ชมพู/บานเย็น
}

/** นาทีจากเที่ยงคืนของเวลาออกรอบ · null = ไม่ระบุ */
function startMin(startTime: string): number | null {
  if (!startTime) return null
  const [hh, mm] = startTime.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0)
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(iso: string, n: number): string {
  const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d)
}

/** คำนำหน้าหัวรอบ: ≥15.30 = คืนวัน{เลือก} · <15.30 = เช้ามืด/เช้า/บ่ายวันถัดไป */
function roundDayPrefix(startTime: string, chosenDay: string, nextDay: string, isNextDay: boolean): string {
  if (!startTime) return `รอบวัน${chosenDay}`
  if (!isNextDay) return `คืนวัน${chosenDay}`
  const hh = Number(startTime.split(':')[0]) || 0
  if (hh < 6) return `เช้ามืดวัน${nextDay}`
  if (hh < 12) return `เช้าวัน${nextDay}`
  return `บ่ายวัน${nextDay}`
}

function timeDisp(startTime: string): string {
  if (!startTime) return ''
  const [hh, mm] = startTime.split(':')
  return `${Number(hh)}.${mm ?? '00'}` // เลียนแบบทีม: ไม่มีเลข 0 นำหน้าชั่วโมง (4.00, 8.00, 15.30)
}

export interface DispatchTextOptions {
  /** true = ใส่มาร์กเกอร์ * (24)/(48)/* (วัน) จาก schedule · false = โค้ดลูกค้าล้วน */
  withMarkers?: boolean
}

/** สร้างข้อความแผนคิวของ "คืนวัน X" (ตัดวันที่ 15.30 · รวมรอบเช้ามืด/เช้าวันถัดไปก่อน 15.30)
 *  466 — แสดงเฉพาะลูกค้าที่มีคิวจริงในวันที่รอบนั้นวิ่ง (= มี chip) + อยู่รอบนั้นจริง (effectiveRoundId) */
export function buildDispatchText(
  nightDate: string,
  rounds: Round[],
  customers: Customer[],
  overrides: ScheduleOverride[] = [],
  opts: DispatchTextOptions = {},
): string {
  const withMarkers = opts.withMarkers !== false
  const d0 = parseISO(nightDate)
  const chosenDay = THAI_DAY[d0.getDay()]
  const nextDay = THAI_DAY[(d0.getDay() + 1) % 7]
  const dateNext = addDays(nightDate, 1)
  const header = `คืนวัน${chosenDay}ที่ ${d0.getDate()}-${d0.getMonth() + 1}-${shortBE(d0.getFullYear())}`

  // override เฉพาะ 2 วันของคืนนี้ (subset เล็ก → isQueuedOnDate เร็ว)
  const nightOverrides = overrides.filter(o => o.date === nightDate || o.date === dateNext)

  // แต่ละรอบ → runDate (≥15.30 = วันที่เลือก · <15.30 = วันถัดไป) + key เรียงนาฬิกาคืนงาน
  const ordered = rounds
    .filter(r => r.isActive)
    .map(r => {
      const min = startMin(r.startTime)
      const isNextDay = min != null && min < PIVOT_MIN
      return { r, isNextDay, runDate: isNextDay ? dateNext : nightDate, key: min == null ? 99999 : (isNextDay ? min + 1440 : min) }
    })
    .sort((a, b) => a.key - b.key)

  const blocks: string[] = []
  for (const { r, isNextDay, runDate } of ordered) {
    const members = customers
      .filter(c => c.isActive && effectiveRoundId(c, runDate) === r.id && isQueuedOnDate(c, runDate, nightOverrides))
      .sort((a, b) => (a.routeSequence || 0) - (b.routeSequence || 0) || a.shortName.localeCompare(b.shortName, 'th'))
    if (members.length === 0) continue
    const head = `${roundHeart(r.color)}( ${roundDayPrefix(r.startTime, chosenDay, nextDay, isNextDay)} ${timeDisp(r.startTime)} รอบ ${r.code})`
    const lines = members.map(c => withMarkers ? `- ${c.shortName} ${customerMarker(c)}` : `- ${c.shortName}`)
    blocks.push([head, '', ...lines].join('\n'))
  }

  if (blocks.length === 0) {
    return `${header}\n\n${HEADER_NOTE}\n${SEP}\n(ไม่มีคิวงานในคืนนี้ — เช็คตารางคิวของลูกค้า/รอบ)`
  }

  return [header, '', HEADER_NOTE, SEP, blocks.join(`\n${SEP}\n`), SEP].join('\n')
}
