// 358 / LF Input by AI (Phase 1) — server endpoint
//
// รับรูปใบนับผ้า (base64) + customer item list → Claude Sonnet vision → structured JSON
// key ปลอดภัย (server-only ANTHROPIC_API_KEY) · auth ผ่าน x-fc-session เหมือน /api/db

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { LF_EXTRACT_MODEL, LF_EXTRACT_SYSTEM, LF_EXTRACT_SCHEMA, buildUserText, CHECKLIST_SYSTEM, CHECKLIST_SCHEMA, buildChecklistUserText } from '@/lib/ai-extract-prompt'
import type { LFExtractRequest, ExtractedLF, ExtractedChecklist } from '@/lib/ai-extract-types'

export const runtime = 'nodejs'
export const maxDuration = 60

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BASE64_LEN = 8_000_000 // ~6MB หลัง base64 (รูปจริง ~4.5MB) — client compress ก่อนแล้ว

export async function POST(request: NextRequest) {
  // auth: ต้อง login (header เดียวกับ /api/db)
  const sessionUser = request.headers.get('x-fc-session')
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บนเซิร์ฟเวอร์' },
      { status: 503 },
    )
  }

  let body: LFExtractRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { imageBase64, mediaType, items } = body
  if (!imageBase64 || !ALLOWED_MEDIA.has(mediaType)) {
    return NextResponse.json({ ok: false, error: 'รูปไม่ถูกต้อง (รองรับ JPG/PNG/WebP)' }, { status: 400 })
  }
  if (imageBase64.length > MAX_BASE64_LEN) {
    return NextResponse.json({ ok: false, error: 'รูปใหญ่เกินไป กรุณาถ่ายใหม่หรือย่อขนาด' }, { status: 413 })
  }

  const client = new Anthropic({ apiKey })

  // 363: mode 'checklist' = ใบเช็คผ้า (per-bag) · default 'form' = ใบส่งรับผ้า (4 cols)
  const isChecklist = body.mode === 'checklist'
  const sys = isChecklist ? CHECKLIST_SYSTEM : LF_EXTRACT_SYSTEM
  const schema = isChecklist ? CHECKLIST_SCHEMA : LF_EXTRACT_SCHEMA
  const userText = isChecklist
    ? buildChecklistUserText(Array.isArray(items) ? items : [])
    : buildUserText(Array.isArray(items) ? items : [])

  try {
    const resp = await client.messages.create({
      model: LF_EXTRACT_MODEL,
      max_tokens: 16000,
      system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
      output_config: { format: { type: 'json_schema', schema } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          ],
        },
      ],
    })

    const textBlock = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) {
      return NextResponse.json({ ok: false, error: 'AI ไม่ได้ส่งผลลัพธ์กลับมา' }, { status: 502 })
    }

    let data: ExtractedLF | ExtractedChecklist
    try {
      data = JSON.parse(textBlock.text)
    } catch {
      return NextResponse.json({ ok: false, error: 'AI ส่งผลลัพธ์ในรูปแบบที่อ่านไม่ได้' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (err) {
    // typed SDK errors
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ ok: false, error: 'API key ไม่ถูกต้อง' }, { status: 502 })
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ ok: false, error: 'ใช้งานถี่เกินไป กรุณารอสักครู่' }, { status: 429 })
    }
    if (err instanceof Anthropic.APIError) {
      console.error('[lf-extract] Anthropic APIError:', err.status, err.message)
      return NextResponse.json({ ok: false, error: `AI error: ${err.message}` }, { status: 502 })
    }
    console.error('[lf-extract] Error:', err)
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาดในการประมวลผล' }, { status: 500 })
  }
}
