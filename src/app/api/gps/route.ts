// /api/gps — proxy ไป V2X GPS API (server-only credentials)
//   auth = x-fc-session header (เหมือน /api/db, /api/fleet-photo)
//   GET ?action=cars          → รายชื่อรถที่ติด terminal
//   GET ?action=realtime      → ตำแหน่ง realtime ทุกคัน
//   GET ?action=trips&carId=<v2xCarId>&date=<yyyy-mm-dd> → เที่ยววิ่งของรถวันนั้น
//   GET ?action=mileage&from=<yyyy-mm-dd>&to=<yyyy-mm-dd> → ระยะวิ่งรายวันทุกคัน (428: ไมล์ auto)
//
//   env บนเซิร์ฟเวอร์: V2X_BASE_URL, V2X_USERNAME, V2X_PASSWORD
// Feat 423 C — GPS integration

import { NextRequest, NextResponse } from 'next/server'
import { getCars, getRealtimePositions, getTrips, getDailyMileage, V2xConfigError, V2xApiError } from '@/lib/v2x-client'

export const runtime = 'nodejs'
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  if (!req.headers.get('x-fc-session')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const action = req.nextUrl.searchParams.get('action')
  try {
    if (action === 'cars') {
      return NextResponse.json({ ok: true, data: await getCars() })
    }
    if (action === 'realtime') {
      return NextResponse.json({ ok: true, data: await getRealtimePositions() })
    }
    if (action === 'trips') {
      const carId = req.nextUrl.searchParams.get('carId')
      const date = req.nextUrl.searchParams.get('date')
      const to = req.nextUrl.searchParams.get('to') // optional — ถ้ามี = ช่วง [date..to] (สำหรับ historical)
      if (!carId || !date || !DATE_RE.test(date) || (to && !DATE_RE.test(to))) {
        return NextResponse.json({ ok: false, error: 'ต้องมี carId + date (yyyy-mm-dd)' }, { status: 400 })
      }
      const trips = await getTrips(carId, `${date} 00:00:00`, `${to || date} 23:59:59`)
      return NextResponse.json({ ok: true, data: trips })
    }
    if (action === 'mileage') {
      const from = req.nextUrl.searchParams.get('from')
      const to = req.nextUrl.searchParams.get('to')
      if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
        return NextResponse.json({ ok: false, error: 'ต้องมี from + to (yyyy-mm-dd)' }, { status: 400 })
      }
      return NextResponse.json({ ok: true, data: await getDailyMileage(from, to) })
    }
    return NextResponse.json({ ok: false, error: 'action ไม่ถูกต้อง (cars|realtime|trips|mileage)' }, { status: 400 })
  } catch (err) {
    if (err instanceof V2xConfigError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 503 })
    }
    if (err instanceof V2xApiError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 502 })
    }
    console.error('[gps GET]', err)
    return NextResponse.json({ ok: false, error: 'เชื่อมต่อ V2X ไม่สำเร็จ' }, { status: 500 })
  }
}
