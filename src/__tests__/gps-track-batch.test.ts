// 450 — fetchGpsTracksBatch: โหลด track หลายเที่ยวให้ "ครบ + นิ่ง" (จำกัด concurrency + retry)
//   กันบั๊กเดิม: ยิงทุกเที่ยวพร้อมกัน → V2X timeout บางเที่ยว → เที่ยวหายแบบสุ่ม (9/12/14)
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchGpsTracksBatch } from '@/lib/gps-service'

function res(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}
// /api/gps คืน GpsTrack ที่ normalize ฝั่ง server แล้ว (points/dangers) — ฝั่ง client รับตรงๆ
function okTrack(lat: number) {
  return res({ ok: true, data: { points: [{ lat, lng: 100, speed: 0, time: null }], dangers: [] } })
}
const tripIdOf = (url: string) => new URL(url, 'http://x').searchParams.get('tripId')!

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('fetchGpsTracksBatch (450)', () => {
  it('คืนผลเรียงตรงตาม tripIds', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => okTrack(Number(tripIdOf(url)))))
    const out = await fetchGpsTracksBatch(['11', '22', '33'], { retries: 0 })
    expect(out.map(r => r?.points[0]?.lat)).toEqual([11, 22, 33])
  })

  it('เที่ยวที่ดึงไม่สำเร็จ → null ในตำแหน่งเดิม (เลขเที่ยวไม่กระโดด)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      tripIdOf(url) === '2' ? res({ ok: false, error: 'boom' }, false) : okTrack(1)))
    const out = await fetchGpsTracksBatch(['1', '2', '3'], { retries: 0 })
    expect(out.length).toBe(3)
    expect(out[0]).not.toBeNull()
    expect(out[1]).toBeNull()   // ดึงไม่ได้ = null (ไม่หายไป)
    expect(out[2]).not.toBeNull()
  })

  it('retry แล้วสำเร็จในครั้งถัดมา (กัน timeout ชั่วคราว)', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++
      return calls === 1 ? res({ ok: false, error: 'timeout' }, false) : okTrack(9)
    }))
    const out = await fetchGpsTracksBatch(['1'], { retries: 2 })
    expect(out[0]?.points[0]?.lat).toBe(9)
    expect(calls).toBe(2) // ล้มครั้งแรก → สำเร็จครั้งสอง
  })

  it('จำกัด concurrency ไม่เกินค่าที่กำหนด', async () => {
    let inFlight = 0, peak = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      return okTrack(1)
    }))
    await fetchGpsTracksBatch(['1', '2', '3', '4', '5', '6', '7', '8'], { concurrency: 3, retries: 0 })
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1) // ทำงานขนานจริง (ไม่ใช่ทีละตัว)
  })
})
