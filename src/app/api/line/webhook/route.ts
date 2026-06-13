// /api/line/webhook — รับ event จาก LINE (Messaging API) · Phase A
//   1) verify x-line-signature (กัน request ปลอม)
//   2) เก็บ groupId/userId ลง app_settings.line_target_id อัตโนมัติ (ปลายทางที่จะ push)
//   3) ตอบยืนยันตอน bot ถูกเพิ่มเข้ากลุ่ม/ทักครั้งแรก (join/follow)
//   ตั้ง URL นี้ใน LINE Developers → Messaging API → Webhook URL: https://flowclean.vercel.app/api/line/webhook
import { NextRequest, NextResponse } from 'next/server'
import { verifyLineSignature, setLineTarget, replyLineText } from '@/lib/line'

export const runtime = 'nodejs'

interface LineEvent {
  type?: string
  replyToken?: string
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string }
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifyLineSignature(raw, req.headers.get('x-line-signature'))) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
  }

  let events: LineEvent[] = []
  try { events = (JSON.parse(raw).events as LineEvent[]) || [] } catch { /* empty/verify ping */ }

  for (const ev of events) {
    const src = ev.source || {}
    const id = src.groupId || src.roomId || src.userId
    // เก็บปลายทาง push อัตโนมัติ (กลุ่มสำคัญกว่าผู้ใช้)
    if (id) {
      try { await setLineTarget(id) } catch (e) { console.error('[line webhook] setTarget', e) }
    }
    // bot ถูกเพิ่มเข้ากลุ่ม / มีคน follow → ตอบยืนยัน (ไม่ตอบทุก message เพื่อไม่รก)
    if ((ev.type === 'join' || ev.type === 'follow') && ev.replyToken) {
      try {
        await replyLineText(ev.replyToken, '✅ เชื่อมต่อ FlowClean แล้ว — จะส่งแจ้งเตือน GPS ขาดสัญญาณ / เอกสารรถใกล้หมด / ถึงรอบเซอร์วิส มาที่นี่')
      } catch (e) { console.error('[line webhook] reply', e) }
    }
  }
  return NextResponse.json({ ok: true })
}
