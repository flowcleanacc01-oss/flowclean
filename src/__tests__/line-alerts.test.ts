// Phase A chunk 2 — verify LINE alert builders (GPS/เอกสารรถ/PM + dedup prune)
import { describe, it, expect } from 'vitest'
import { buildGpsAlerts, buildDocAlerts, buildPmAlerts, pruneAlertKeys } from '@/lib/line-alerts'
import type { Vehicle } from '@/types'
import type { GpsPosition } from '@/lib/v2x-types'

const veh = (over: Partial<Vehicle>): Vehicle =>
  ({ id: 'v1', code: 'C', licensePlate: '4ฒฆ-8053', isActive: true,
    insuranceExpiry: '', actExpiry: '', taxExpiry: '', inspectionExpiry: '',
    currentOdometer: 0, nextServiceOdometer: 0, ...over } as Vehicle)

const pos = (over: Partial<GpsPosition>): GpsPosition =>
  ({ carId: 'c', plate: 'C 4ฒฆ-8053', plateNorm: '4ฒฆ-8053', lat: 13.7, lng: 100.5, speed: 0, rpm: 0,
    direction: 0, voltage: 13, online: false, driving: false, gpsTime: '', lastActiveTime: '', ...over })

const TODAY = '2026-06-13'
const NOW = new Date('2026-06-13T12:00:00').getTime()

describe('buildDocAlerts', () => {
  it('ใกล้หมด ≤30 วัน → เตือน · >30 → ไม่ · เลยกำหนด ≤7 วัน → เตือน · >7 → ไม่', () => {
    expect(buildDocAlerts([veh({ taxExpiry: '2026-06-27' })], TODAY)).toHaveLength(1)   // 14 วัน
    expect(buildDocAlerts([veh({ taxExpiry: '2026-08-13' })], TODAY)).toHaveLength(0)   // 61 วัน
    const overdue = buildDocAlerts([veh({ actExpiry: '2026-06-10' })], TODAY)            // เลย 3 วัน
    expect(overdue).toHaveLength(1)
    expect(overdue[0].text).toContain('เลยกำหนด 3 วัน')
    expect(buildDocAlerts([veh({ taxExpiry: '2026-06-01' })], TODAY)).toHaveLength(0)   // เลย 12 วัน
  })
  it('รถ inactive / ไม่มีวันหมด → ไม่เตือน', () => {
    expect(buildDocAlerts([veh({ taxExpiry: '2026-06-20', isActive: false })], TODAY)).toHaveLength(0)
    expect(buildDocAlerts([veh({})], TODAY)).toHaveLength(0)
  })
})

describe('buildPmAlerts', () => {
  it('ใกล้/ถึงระยะเซอร์วิส (≤500 กม.) → เตือน', () => {
    expect(buildPmAlerts([veh({ currentOdometer: 177600, nextServiceOdometer: 178000 })])).toHaveLength(1) // เหลือ 400
    expect(buildPmAlerts([veh({ currentOdometer: 170000, nextServiceOdometer: 178000 })])).toHaveLength(0) // เหลือ 8000
    const over = buildPmAlerts([veh({ currentOdometer: 178200, nextServiceOdometer: 178000 })])
    expect(over[0].text).toContain('เลยกำหนด 200 กม.')
    expect(buildPmAlerts([veh({ nextServiceOdometer: 0 })])).toHaveLength(0) // ยังไม่ตั้ง
  })
})

describe('buildGpsAlerts', () => {
  it('ขาดสัญญาณระหว่างวัน (suspicious) → เตือน · online → ไม่', () => {
    const offline = buildGpsAlerts([pos({ online: false, lastActiveTime: '2026-06-13 10:30:00' })], [veh({})], NOW, TODAY)
    expect(offline).toHaveLength(1)
    expect(offline[0].key).toBe('gps-offline:4ฒฆ-8053:2026-06-13')
    expect(offline[0].text).toContain('GPS ขาดสัญญาณ')
    expect(buildGpsAlerts([pos({ online: true })], [veh({})], NOW, TODAY)).toHaveLength(0)
  })
})

describe('pruneAlertKeys', () => {
  it('ตัด gps-offline ของวันเก่า >7 วัน · เก็บ doc/pm key', () => {
    const kept = pruneAlertKeys([
      'gps-offline:abc:2026-06-12',   // 1 วัน → เก็บ
      'gps-offline:abc:2026-06-01',   // 12 วัน → ตัด
      'doc:v1:taxExpiry:2026-09-29',  // value-based → เก็บ
      'pm:v1:178000',                 // value-based → เก็บ
    ], TODAY)
    expect(kept).toEqual(['gps-offline:abc:2026-06-12', 'doc:v1:taxExpiry:2026-09-29', 'pm:v1:178000'])
  })
})
