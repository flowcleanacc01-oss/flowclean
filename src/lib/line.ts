// LINE Messaging API helpers — ⚠️ SERVER ONLY (เรียกจาก /api/line/* เท่านั้น)
//   Phase A (งาน D / LINE bot): push แจ้งเตือน GPS/เอกสารรถ/PM เข้ากลุ่มงาน
//   env: LINE_CHANNEL_ACCESS_TOKEN (long-lived) + LINE_CHANNEL_SECRET (verify webhook)
//   target (กลุ่ม/ผู้ใช้ที่จะ push) = webhook เก็บอัตโนมัติลง app_settings.line_target_id ตอน bot ถูกเพิ่ม
import crypto from 'crypto'
import { supabaseAdmin } from './supabase-admin'

const PUSH_URL = 'https://api.line.me/v2/bot/message/push'
const REPLY_URL = 'https://api.line.me/v2/bot/message/reply'
const TARGET_KEY = 'line_target_id'

export function lineConfigured(): boolean {
  return !!process.env.LINE_CHANNEL_ACCESS_TOKEN
}

/** verify header x-line-signature = base64( HMAC-SHA256(channelSecret, rawBody) ) */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret || !signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false // ความยาวต่างกัน = signature ผิด
  }
}

/** target ที่จะ push — env LINE_TARGET_ID ก่อน, ไม่งั้นจาก app_settings (webhook เก็บไว้) */
export async function getLineTarget(): Promise<string | null> {
  if (process.env.LINE_TARGET_ID) return process.env.LINE_TARGET_ID
  const { data } = await supabaseAdmin.from('app_settings').select('value').eq('key', TARGET_KEY).maybeSingle()
  const v = data?.value
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'id' in v) return String((v as { id: string }).id)
  return null
}

/** webhook เก็บ groupId/userId อัตโนมัติตอน bot ถูกเพิ่ม/ทัก */
export async function setLineTarget(id: string): Promise<void> {
  await supabaseAdmin.from('app_settings').upsert(
    { key: TARGET_KEY, value: id, updated_at: new Date().toISOString(), updated_by: 'line-webhook' },
    { onConflict: 'key' },
  )
}

async function linePost(url: string, body: unknown): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`LINE ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

/** push ข้อความ (≤5 ก้อน) ไป target · คืน sent=false ถ้ายังไม่มี token/target (ไม่ throw) */
export async function pushLineText(lines: string[]): Promise<{ sent: boolean; reason?: string }> {
  if (!lineConfigured()) return { sent: false, reason: 'ยังไม่ตั้ง access token' }
  const target = await getLineTarget()
  if (!target) return { sent: false, reason: 'ยังไม่มี target (เพิ่ม bot เข้ากลุ่มก่อน)' }
  const messages = lines.filter(Boolean).slice(0, 5).map(text => ({ type: 'text', text }))
  if (messages.length === 0) return { sent: false, reason: 'ไม่มีข้อความ' }
  await linePost(PUSH_URL, { to: target, messages })
  return { sent: true }
}

/** ตอบกลับ event (ใช้ใน webhook ตอน bot ถูกเพิ่ม — ยืนยันการเชื่อมต่อ) */
export async function replyLineText(replyToken: string, text: string): Promise<void> {
  await linePost(REPLY_URL, { replyToken, messages: [{ type: 'text', text }] })
}
