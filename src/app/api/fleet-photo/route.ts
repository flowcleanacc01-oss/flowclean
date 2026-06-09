// 423 Phase A — Fleet odometer photo API (service_role) — upload / signed-URL view / delete
//   รูปหน้าปัดเรือนไมล์ตอนออกงาน · private bucket · auth = x-fc-session (เหมือน /api/db)
//   เข้าถึงไฟล์ผ่าน signed URL (หมดอายุ 5 นาที) เท่านั้น · pattern เดียวกับ /api/qt-scan (397)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

const BUCKET = 'odometer-photos'
const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

let bucketReady = false
async function ensureBucket() {
  if (bucketReady) return
  // idempotent — ถ้ามีอยู่แล้ว createBucket จะ error → ignore
  await supabaseAdmin.storage
    .createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: Object.keys(MIME_EXT) })
    .catch(() => {})
  bucketReady = true
}

function authed(req: NextRequest): boolean {
  return !!req.headers.get('x-fc-session')
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const form = await req.formData()
    const file = form.get('file')
    const vehicleId = String(form.get('vehicleId') || '').replace(/[^a-zA-Z0-9_-]/g, '') // กัน path traversal
    // category (optional) — แยกโฟลเดอร์รูป เช่น fuel-receipt/fuel-slip/fuel-gauge (กันชนกับรูปหน้าปัด odometer)
    const category = String(form.get('category') || '').replace(/[^a-zA-Z0-9_-]/g, '')
    if (!(file instanceof File) || !vehicleId) {
      return NextResponse.json({ error: 'ต้องมี file + vehicleId' }, { status: 400 })
    }
    const ext = MIME_EXT[file.type]
    if (!ext) return NextResponse.json({ error: 'รองรับเฉพาะ .jpg .png' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 10MB' }, { status: 400 })

    await ensureBucket()
    // random suffix กันชนเมื่ออัปหลายรูปใน ms เดียวกัน (fuel = 3 รูปพร้อมกัน)
    const rand = Math.random().toString(36).slice(2, 8)
    const prefix = category ? `${vehicleId}/${category}` : vehicleId
    const path = `${prefix}/${Date.now()}-${rand}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type,
      upsert: false,
    })
    if (error) {
      console.error('[fleet-photo POST]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, path })
  } catch (err) {
    console.error('[fleet-photo POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message || 'ไม่พบไฟล์' }, { status: 404 })
  return NextResponse.json({ url: data.signedUrl })
}

export async function DELETE(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path])
  if (error) {
    console.error('[fleet-photo DELETE]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
