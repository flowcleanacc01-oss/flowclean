// 433 — verify GPS disconnect classifier (จับขาดสัญญาณ อาจถูกถอด)
import { describe, it, expect } from 'vitest'
import { connStatus } from '@/lib/gps-connection'
import type { GpsPosition } from '@/lib/v2x-types'

const pos = (over: Partial<GpsPosition>): GpsPosition =>
  ({ carId: 'c', plate: 'C 1', plateNorm: '1', lat: 13.7, lng: 100.5, speed: 0, rpm: 0, direction: 0,
    voltage: 13, online: false, driving: false, gpsTime: '', lastActiveTime: '', ...over })

// now = 2026-06-13 12:30
const NOW = new Date('2026-06-13T12:30:00').getTime()

describe('connStatus — สถานะเชื่อมต่อ GPS', () => {
  it('online → level online', () => {
    const s = connStatus(pos({ online: true, lastActiveTime: '2026-06-13 12:29:00' }), NOW)
    expect(s.level).toBe('online')
    expect(s.offlineMin).toBe(0)
  })

  it('เพิ่งขาด <30 นาที → recent', () => {
    const s = connStatus(pos({ online: false, lastActiveTime: '2026-06-13 12:10:00' }), NOW) // 20 นาที
    expect(s.level).toBe('recent')
    expect(s.offlineMin).toBe(20)
  })

  it('ขาดระหว่างวัน 30 นาที–8 ชม. → suspicious (เคส C: เห็นล่าสุด 11:01 วันนี้)', () => {
    const s = connStatus(pos({ online: false, lastActiveTime: '2026-06-13 11:01:00' }), NOW) // ~89 นาที
    expect(s.level).toBe('suspicious')
    expect(s.offlineMin).toBe(89)
  })

  it('ขาดนาน >8 ชม. → long (เคส A: เห็นล่าสุดเมื่อวาน 21:37)', () => {
    const s = connStatus(pos({ online: false, lastActiveTime: '2026-06-12 21:37:00' }), NOW)
    expect(s.level).toBe('long')
    expect(s.offlineMin).toBeGreaterThan(LONG())
  })

  it('parse เวลาไม่ได้ → offlineMin 0, level recent (ไม่ false-alarm)', () => {
    const s = connStatus(pos({ online: false, lastActiveTime: '' }), NOW)
    expect(s.offlineMin).toBe(0)
    expect(s.level).toBe('recent')
  })
})

function LONG() { return 8 * 60 }
