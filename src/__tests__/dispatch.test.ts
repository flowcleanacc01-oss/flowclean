// 423 Phase B2 — verify Dispatch generate logic
//   buildTripStops (membership + schedule + mode) · generateDailyTrips (idempotent) · helpers
import { describe, it, expect } from 'vitest'
import { buildTripStops, generateDailyTrips, tripLoad, resequence, capacityStatus, skipQueueReview, effectiveRoundId } from '@/lib/dispatch'
import { getWeekStart, addDays } from '@/lib/logistics-week'
import { dailyTripId } from '@/types'
import type { Customer, Round, ScheduleOverride, DailyTrip, TripStop } from '@/types'

// known weekday anchors
const SUN = getWeekStart('2026-05-20')
const MON = addDays(SUN, 1), TUE = addDays(SUN, 2)

const round = (over: Partial<Round>): Round =>
  ({ id: 'round-v', code: 'V', name: 'รอบ V', startTime: '04:00', endTime: '13:00',
    defaultVehicleId: 'veh-a', defaultDriverId: 'drv-1', defaultHelperId: '',
    color: '#0ea5e9', sortOrder: 1, isActive: true, note: '', createdAt: '', ...over } as Round)

const cust = (over: Partial<Customer>): Customer =>
  ({ id: 'c1', name: 'KAYA', shortName: 'KAYA', isActive: true, scheduleType: 'daily',
    roundId: 'round-v', routeSequence: 1, ...over } as Customer)

const ov = (customerId: string, date: string, type: ScheduleOverride['type']): ScheduleOverride =>
  ({ id: `o-${date}-${type}`, customerId, date, type, reason: 't', createdAt: '', createdBy: 't' } as ScheduleOverride)

describe('buildTripStops — membership + schedule', () => {
  const r = round({})

  it('mode=schedule: เฉพาะลูกค้าในรอบที่ถึงคิว เรียงตาม routeSequence', () => {
    const customers = [
      cust({ id: 'c2', shortName: 'B', routeSequence: 2, scheduleType: 'daily' }),
      cust({ id: 'c1', shortName: 'A', routeSequence: 1, scheduleType: 'daily' }),
      cust({ id: 'c3', shortName: 'C', routeSequence: 3, scheduleType: 'weekly', scheduleDays: [1] }), // จันทร์เท่านั้น
    ]
    const stopsMon = buildTripStops(r, customers, MON, [], 'schedule')
    expect(stopsMon.map(s => s.customerId)).toEqual(['c1', 'c2', 'c3']) // A,B,C เรียง seq
    expect(stopsMon.map(s => s.sequence)).toEqual([1, 2, 3])

    const stopsTue = buildTripStops(r, customers, TUE, [], 'schedule')
    expect(stopsTue.map(s => s.customerId)).toEqual(['c1', 'c2']) // C ไม่ถึงคิวอังคาร
  })

  it('mode=all: ทุกสมาชิกรอบ ไม่สน schedule', () => {
    const customers = [
      cust({ id: 'c1', routeSequence: 1, scheduleType: 'none' }),
      cust({ id: 'c2', routeSequence: 2, scheduleType: 'weekly', scheduleDays: [1] }),
    ]
    const stops = buildTripStops(r, customers, TUE, [], 'all')
    expect(stops.map(s => s.customerId)).toEqual(['c1', 'c2'])
  })

  it('กรองเฉพาะ roundId ตรง + isActive', () => {
    const customers = [
      cust({ id: 'c1', roundId: 'round-v' }),
      cust({ id: 'c2', roundId: 'round-spa' }),   // รอบอื่น
      cust({ id: 'c3', roundId: 'round-v', isActive: false }), // ปิด
    ]
    const stops = buildTripStops(r, customers, MON, [], 'all')
    expect(stops.map(s => s.customerId)).toEqual(['c1'])
  })

  it('override skip ตัดออก · extra ดึงเข้า (mode schedule)', () => {
    const customers = [
      cust({ id: 'c1', scheduleType: 'daily' }),                          // ปกติเข้า
      cust({ id: 'c2', scheduleType: 'weekly', scheduleDays: [9], routeSequence: 2 }), // ไม่มีวันไหนตรง
    ]
    const overrides = [ov('c1', MON, 'skip'), ov('c2', MON, 'extra')]
    const stops = buildTripStops(r, customers, MON, overrides, 'schedule')
    expect(stops.map(s => s.customerId)).toEqual(['c2']) // c1 skip, c2 extra
  })

  it('snapshot หน้าต่างเวลาเข้า stop', () => {
    const customers = [cust({ id: 'c1', pickupWindowStart: '10:00', pickupWindowEnd: '16:00' })]
    const stops = buildTripStops(r, customers, MON, [], 'schedule')
    expect(stops[0]).toMatchObject({ timeWindowStart: '10:00', timeWindowEnd: '16:00', source: 'regular', status: 'pending', bagCount: 0 })
  })
})

describe('generateDailyTrips — idempotent', () => {
  const rounds = [
    round({ id: 'round-v', code: 'V', sortOrder: 1, isActive: true }),
    round({ id: 'round-spa', code: 'SPA', sortOrder: 2, isActive: true }),
    round({ id: 'round-szh', code: 'SZH', sortOrder: 3, isActive: false }), // พัก → ข้าม
  ]
  const customers = [
    cust({ id: 'c1', roundId: 'round-v', scheduleType: 'daily' }),
    cust({ id: 'c2', roundId: 'round-spa', scheduleType: 'daily' }),
  ]

  it('สร้างเฉพาะรอบ active + deterministic id', () => {
    const { created, skipped } = generateDailyTrips(rounds, customers, MON, [], new Set(), 'schedule', 'u1')
    expect(created.map(c => c.trip.roundId)).toEqual(['round-v', 'round-spa']) // ไม่มี SZH
    expect(created[0].trip.id).toBe(dailyTripId(MON, 'round-v'))
    expect(skipped).toBe(0)
  })

  it('ข้ามรอบที่มีใบงานแล้ว (ไม่ทับ)', () => {
    const existing = new Set([dailyTripId(MON, 'round-v')])
    const { created, skipped } = generateDailyTrips(rounds, customers, MON, [], existing, 'schedule', 'u1')
    expect(created.map(c => c.trip.roundId)).toEqual(['round-spa'])
    expect(skipped).toBe(1)
  })

  it('default รถ/คน มาจากรอบ', () => {
    const { created } = generateDailyTrips(rounds, customers, MON, [], new Set(), 'schedule', 'u1')
    expect(created[0].trip.vehicleId).toBe('veh-a')
    expect(created[0].trip.driverId).toBe('drv-1')
  })
})

describe('helpers', () => {
  it('tripLoad = ผลรวม bagCount', () => {
    const trip = { stops: [{ bagCount: 17 }, { bagCount: 22 }, { bagCount: 0 }] } as DailyTrip
    expect(tripLoad(trip)).toBe(39)
  })

  it('resequence = 1..n ต่อเนื่อง', () => {
    const stops = [{ sequence: 5 }, { sequence: 9 }, { sequence: 2 }] as TripStop[]
    expect(resequence(stops).map(s => s.sequence)).toEqual([1, 2, 3])
  })
})

describe('capacityStatus (B-1) — เทียบ load กับเป้า', () => {
  it('ไม่ตั้งเป้า = none', () => {
    expect(capacityStatus(100, 0)).toBe('none')
  })
  it('ตามเคสติ๊ด: เป้า 160 → <160 น้อย · ~ปกติ · 200 เริ่มเยอะ · 250 เตือน', () => {
    expect(capacityStatus(150, 160)).toBe('low')   // < เป้า → เสี่ยงต้นทุน
    expect(capacityStatus(180, 160)).toBe('ok')    // ≤ 1.25× (200)
    expect(capacityStatus(210, 160)).toBe('warn')  // 1.25×–1.5× (200–240)
    expect(capacityStatus(250, 160)).toBe('high')  // > 1.5× (240)
  })
})

describe('skipQueueReview (B-2) — ถึงคิวแต่ถุง=0', () => {
  const trip = (roundId: string, stops: Partial<TripStop>[]): DailyTrip =>
    ({ id: dailyTripId(MON, roundId), date: MON, roundId, vehicleId: '', driverId: '', helperId: '',
       status: 'planned', note: '', stops: stops.map((s, i) => ({ customerId: '', sequence: i + 1, source: 'regular', bagCount: 0, status: 'pending', note: '', timeWindowStart: '', timeWindowEnd: '', ...s })) as TripStop[],
       createdBy: '', createdAt: '' } as DailyTrip)

  it('flag จุดประจำที่ถุง=0 + ถึงคิว · ข้ามจุดที่มีถุง/แทรก', () => {
    const customers = [
      cust({ id: 'c1', shortName: 'A', scheduleType: 'daily' }),
      cust({ id: 'c2', shortName: 'B', scheduleType: 'daily' }),
      cust({ id: 'c3', shortName: 'C', scheduleType: 'daily' }),
    ]
    const t = trip('round-v', [
      { customerId: 'c1', bagCount: 0, source: 'regular' },  // ถึงคิว ถุง 0 → flag
      { customerId: 'c2', bagCount: 12, source: 'regular' }, // มีถุง → ข้าม
      { customerId: 'c3', bagCount: 0, source: 'inserted' }, // แทรก → ข้าม
    ])
    const r = skipQueueReview([t], customers, MON, [])
    expect(r.map(x => x.customerId)).toEqual(['c1'])
  })

  it('ยกเว้นกลุ่มเจ้าของเดียวกัน: สาขาอื่นในกลุ่มส่งแล้ว → ไม่ flag', () => {
    const customers = [
      cust({ id: 'sen', shortName: 'SEN', scheduleType: 'daily', ownerGroup: 'SEN' }),
      cust({ id: 'sen2', shortName: 'SEN2', scheduleType: 'daily', ownerGroup: 'SEN' }),
      cust({ id: 'lone', shortName: 'X', scheduleType: 'daily', ownerGroup: '' }),
    ]
    const t = trip('round-v', [
      { customerId: 'sen', bagCount: 30, source: 'regular' }, // SEN ส่ง 30
      { customerId: 'sen2', bagCount: 0, source: 'regular' }, // SEN2 = 0 แต่กลุ่มส่งแล้ว → ไม่ flag
      { customerId: 'lone', bagCount: 0, source: 'regular' }, // ไม่มีกลุ่ม + 0 → flag
    ])
    const r = skipQueueReview([t], customers, MON, [])
    expect(r.map(x => x.customerId)).toEqual(['lone'])
  })
})

// 429 — รอบหลัก + ข้อยกเว้นรายวัน (เคสติ๊ด: IONA รอบหลัก SPA · เสาร์ไปรอบ V)
describe('429 — effectiveRoundId + buildTripStops ข้อยกเว้นรายวัน', () => {
  const SAT = addDays(SUN, 6)
  const roundV = round({})
  const roundSpa = round({ id: 'round-spa', code: 'SPA' })
  // IONA: คิวประจำ อังคาร(2) + เสาร์(6) · รอบหลัก SPA · เสาร์ → V
  const iona = cust({
    id: 'iona', shortName: 'IONA', roundId: 'round-spa',
    scheduleType: 'weekly', scheduleDays: [2, 6],
    roundDayOverrides: { 6: 'round-v' },
  })

  it('effectiveRoundId: วัน override → รอบใหม่ · วันอื่น → รอบหลัก', () => {
    expect(effectiveRoundId(iona, SAT)).toBe('round-v')
    expect(effectiveRoundId(iona, TUE)).toBe('round-spa')
  })

  it('เสาร์: IONA โผล่ในรอบ V และหายจาก SPA · อังคาร: กลับด้าน', () => {
    expect(buildTripStops(roundV, [iona], SAT, [], 'schedule').map(s => s.customerId)).toEqual(['iona'])
    expect(buildTripStops(roundSpa, [iona], SAT, [], 'schedule')).toEqual([])
    expect(buildTripStops(roundSpa, [iona], TUE, [], 'schedule').map(s => s.customerId)).toEqual(['iona'])
    expect(buildTripStops(roundV, [iona], TUE, [], 'schedule')).toEqual([])
  })

  it('mode=all ก็เคารพข้อยกเว้น (สมาชิกของวันนั้นจริงๆ)', () => {
    expect(buildTripStops(roundV, [iona], SAT, [], 'all').map(s => s.customerId)).toEqual(['iona'])
    expect(buildTripStops(roundSpa, [iona], SAT, [], 'all')).toEqual([])
  })

  it('ไม่มี override → พฤติกรรมเดิมทุกวัน · override ว่าง/ชี้รอบหลักเอง → ไม่เปลี่ยน', () => {
    const plain = cust({ id: 'p1' })
    expect(effectiveRoundId(plain, SAT)).toBe('round-v')
    const selfPoint = cust({ id: 'p2', roundDayOverrides: { 6: '' } })
    expect(effectiveRoundId(selfPoint, SAT)).toBe('round-v')
  })
})
