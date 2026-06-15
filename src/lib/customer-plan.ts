// 453 — แผนคิวรับ-ส่งผ้าเฉพาะลูกค้า (ส่งให้ลูกค้ารู้คิวล่วงหน้า)
//   ขยาย schedule ของลูกค้า 1 ราย ในช่วง 1/2/3 เดือน → รายการวันคิว (apply skip/extra override)
//   + เวลา (pickup window ของลูกค้า → fallback เวลารอบ) · pure (testable)
//   reuse isScheduledDay (schedule-audit) + effectiveRoundId (dispatch) — กติกาเดียวกับ Audit/Dispatch
import type { Customer, Round, ScheduleOverride } from '@/types'
import { isScheduledDay } from './schedule-audit'
import { effectiveRoundId } from './dispatch'

// TZ-safe local date (เลี่ยง off-by-one TZ+7 — บทเรียน timezone safety)
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function* dateRange(start: string, end: string): Generator<string> {
  const cur = parseLocalDate(start)
  const endDate = parseLocalDate(end)
  while (cur <= endDate) { yield toLocalISO(cur); cur.setDate(cur.getDate() + 1) }
}

const THAI_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const THAI_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_DAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

/** "จ. 16 มิ.ย." */
export function thaiDateShort(iso: string): string {
  const d = parseLocalDate(iso)
  return `${THAI_DAY_SHORT[d.getDay()]} ${d.getDate()} ${THAI_MONTH_SHORT[d.getMonth()]}`
}
/** "มิถุนายน 2569" (พ.ศ.) */
export function thaiMonthYear(iso: string): string {
  const d = parseLocalDate(iso)
  return `${THAI_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`
}
/** "15 มิ.ย. – 31 ส.ค. 2569" — ป้ายช่วงวันสำหรับหัวเอกสาร/ข้อความ */
export function thaiRangeLabel(start: string, end: string): string {
  const a = parseLocalDate(start), b = parseLocalDate(end)
  return `${a.getDate()} ${THAI_MONTH_SHORT[a.getMonth()]} – ${b.getDate()} ${THAI_MONTH_SHORT[b.getMonth()]} ${b.getFullYear() + 543}`
}

export interface PlanDay {
  date: string          // ISO
  dow: number           // 0-6
  roundId: string
  rescheduledIn: boolean // เพิ่มพิเศษจาก override (extra/reschedule_add วันที่ไม่ใช่คิวปกติ)
  timeStart: string     // HH:MM ('' = ไม่ระบุ)
  timeEnd: string
}

/**
 * ช่วงวันของแผน N เดือน — ตั้งแต่ "วันนี้" ถึงสิ้นเดือนที่ (เดือนนี้ + N-1)
 *   1=เดือนนี้ · 2=เดือนนี้+เดือนหน้า · 3=เดือนนี้+เดือนหน้า+อีก 2 เดือน
 */
export function planRange(today: string, months: number): { start: string; end: string } {
  const d = parseLocalDate(today)
  const end = new Date(d.getFullYear(), d.getMonth() + months, 0) // วันสุดท้ายของเดือนที่ +(months-1)
  return { start: today, end: toLocalISO(end) }
}

/** วันคิวของลูกค้า 1 ราย ใน [start,end] — apply override (skip ตัดออก · extra เพิ่ม) + เวลา */
export function buildCustomerPlan(
  customer: Customer,
  start: string,
  end: string,
  overrides: ScheduleOverride[],
  rounds: Round[],
): PlanDay[] {
  const roundById = new Map(rounds.map(r => [r.id, r]))
  const ovByDate = new Map<string, ScheduleOverride[]>()
  for (const o of overrides) {
    if (o.customerId !== customer.id || o.date < start || o.date > end) continue
    const arr = ovByDate.get(o.date)
    if (arr) arr.push(o); else ovByDate.set(o.date, [o])
  }
  const out: PlanDay[] = []
  for (const date of dateRange(start, end)) {
    const base = isScheduledDay(date, customer)
    const ov = ovByDate.get(date) || []
    const skip = ov.some(o => o.type === 'skip' || o.type === 'reschedule_skip')
    const extra = ov.some(o => o.type === 'extra' || o.type === 'reschedule_add')
    let expected = base
    if (skip) expected = false
    if (extra) expected = true
    if (!expected) continue
    const r = roundById.get(effectiveRoundId(customer, date))
    out.push({
      date, dow: parseLocalDate(date).getDay(), roundId: r?.id || '',
      rescheduledIn: extra && !base,
      timeStart: customer.pickupWindowStart || r?.startTime || '',
      timeEnd: customer.pickupWindowEnd || r?.endTime || '',
    })
  }
  return out
}

/** ข้อความแผนคิว (คัดลอกส่งไลน์ให้ลูกค้า) — จัดกลุ่มตามเดือน */
export function buildCustomerPlanText(
  customerName: string,
  days: PlanDay[],
  companyName: string,
  rangeLabel: string,
): string {
  const SEP = '━━━━━━━━━━'
  const lines: string[] = ['📋 แผนคิวรับ-ส่งผ้า', customerName, rangeLabel, SEP]
  if (days.length === 0) {
    lines.push('(ไม่มีคิวในช่วงนี้)')
  } else {
    let curMonth = ''
    for (const d of days) {
      const mk = d.date.slice(0, 7)
      if (mk !== curMonth) { curMonth = mk; lines.push('', `📅 ${thaiMonthYear(d.date)}`) }
      const time = d.timeStart ? ` ⏰ ${d.timeStart}${d.timeEnd ? `-${d.timeEnd}` : ''}` : ''
      lines.push(`• ${thaiDateShort(d.date)}${time}${d.rescheduledIn ? ' (เพิ่มพิเศษ)' : ''}`)
    }
    lines.push('', SEP, `รวม ${days.length} ครั้ง`)
  }
  if (companyName) lines.push(`— ${companyName}`)
  return lines.join('\n')
}
