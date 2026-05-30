// 397 — QT accepted-scan API (service_role) — upload / signed-URL view / delete
//   private bucket · auth = x-fc-session (เหมือน /api/db) · เข้าถึงไฟล์ผ่าน signed URL (หมดอายุ 5 นาที) เท่านั้น
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

const BUCKET = 'qt-accepted-scans'
const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
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
    const qtId = String(form.get('qtId') || '').replace(/[^a-zA-Z0-9_-]/g, '') // กัน path traversal
    if (!(file instanceof File) || !qtId) {
      return NextResponse.json({ error: 'ต้องมี file + qtId' }, { status: 400 })
    }
    const ext = MIME_EXT[file.type]
    if (!ext) return NextResponse.json({ error: 'รองรับเฉพาะ .jpg .png .pdf' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 10MB' }, { status: 400 })

    await ensureBucket()
    const path = `${qtId}/${Date.now()}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type,
      upsert: false,
    })
    if (error) {
      console.error('[qt-scan POST]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, path })
  } catch (err) {
    console.error('[qt-scan POST]', err)
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
    console.error('[qt-scan DELETE]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
