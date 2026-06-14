// /api/line/cron — เช็คเงื่อนไข → push แจ้งเตือนเข้ากลุ่ม LINE (Phase A chunk 2)
//   3 เช็ค: GPS ขาดสัญญาณ (433) · เอกสารรถใกล้หมด · ถึงรอบเซอร์วิส (PM) · กันเตือนซ้ำด้วย state
//   auth: ?key=<CRON_SECRET> หรือ header Authorization: Bearer <CRON_SECRET> (Vercel Cron ส่งให้อัตโนมัติ)
//   ตั้งเวลา: Vercel Cron (vercel.json) วันละครั้ง + external cron (cron-job.org) ทุก ~30 นาที สำหรับ GPS realtime
import { NextRequest, NextResponse } from 'next/server'
import { getRealtimePositions } from '@/lib/v2x-client'
import { fetchVehicles, fetchCompanyInfo } from '@/lib/supabase-service'
import { buildGpsAlerts, buildDocAlerts, buildPmAlerts, pruneAlertKeys, type LineAlert } from '@/lib/line-alerts'
import { pushLineText, getAlertedKeys, saveAlertedKeys, lineConfigured } from '@/lib/line'

export const runtime = 'nodejs'
export const maxDuration = 60

// แยกสาเหตุ unauthorized เพื่อ debug (ไม่เผย secret)
function authCheck(req: NextRequest): { ok: boolean; reason?: string } {
  const secret = process.env.CRON_SECRET
  if (!secret) return { ok: false, reason: 'ยังไม่ได้ตั้ง CRON_SECRET บนเซิร์ฟเวอร์ — เพิ่มใน Vercel env แล้ว Redeploy' }
  const key = req.nextUrl.searchParams.get('key')
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (key === secret || bearer === secret) return { ok: true }
  return { ok: false, reason: 'key ไม่ตรงกับ CRON_SECRET — เช็คว่าเหมือนเป๊ะ + ไม่มีเว้นวรรค/อักขระพิเศษ (+ & # เว้นวรรค)' }
}

export async function GET(req: NextRequest) {
  const auth = authCheck(req)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized', hint: auth.reason }, { status: 401 })
  }
  if (!lineConfigured()) {
    return NextResponse.json({ ok: false, error: 'LINE ยังไม่ตั้งค่า' }, { status: 503 })
  }

  // โหมดทดสอบ: ?test=1 → push ข้อความตัวอย่างเข้ากลุ่ม (ยืนยัน end-to-end · ไม่เช็คเงื่อนไข)
  if (req.nextUrl.searchParams.get('test') === '1') {
    const r = await pushLineText(['🔔 ทดสอบแจ้งเตือน FlowClean — เชื่อมต่อพร้อมแล้ว ✅\nเมื่อมี GPS ขาดสัญญาณ / เอกสารรถใกล้หมด / ถึงรอบเซอร์วิส จะเด้งมาที่นี่อัตโนมัติ'])
    return NextResponse.json({ ok: r.sent, test: true, reason: r.reason })
  }

  // ดึงข้อมูล (best-effort — GPS fail ไม่ทำให้ doc/PM ล่ม)
  const [positions, vehicles, company] = await Promise.all([
    getRealtimePositions().catch(() => []),
    fetchVehicles().catch(() => []),
    fetchCompanyInfo().catch(() => null),
  ])

  const nowMs = Date.now()
  const todayTH = new Date(nowMs + 7 * 3600 * 1000).toISOString().slice(0, 10) // วันที่ไทย (UTC+7)
  // 444.1 — พิกัดโรงงาน → ข้ามเตือน GPS ของรถที่จอดในโรงงาน (เข้า factory station = ปกติ)
  const factory = company && (company.factoryLat || company.factoryLng)
    ? { lat: company.factoryLat, lng: company.factoryLng } : null

  const alerts: LineAlert[] = [
    ...buildGpsAlerts(positions, vehicles, nowMs, todayTH, factory),
    ...buildDocAlerts(vehicles, todayTH),
    ...buildPmAlerts(vehicles),
  ]

  // กันเตือนซ้ำ — เตือนเฉพาะ key ที่ยังไม่เคยเตือน
  const alerted = new Set(await getAlertedKeys())
  const fresh = alerts.filter(a => !alerted.has(a.key))

  if (fresh.length === 0) {
    return NextResponse.json({ ok: true, checked: alerts.length, sent: 0 })
  }

  const result = await pushLineText(fresh.map(a => a.text))
  if (result.sent) {
    fresh.forEach(a => alerted.add(a.key))
    await saveAlertedKeys(pruneAlertKeys([...alerted], todayTH))
  }
  return NextResponse.json({ ok: true, checked: alerts.length, sent: result.sent ? fresh.length : 0, reason: result.reason })
}
