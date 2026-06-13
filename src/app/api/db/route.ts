import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// 410 — เพิ่มเวลา function (default Vercel 10s) → insert/update batch ใหญ่ไม่ถูก kill กลางคัน
//   (เคยเจอ: batch 1399 ใบ → timeout → "fail to fetch" + DB commit ไปแล้วบางส่วน 1298 = ข้อมูลซ้ำ)
//   คู่กับ chunk insert (supabase-service) — แต่ละ chunk เร็วอยู่แล้ว นี่เป็น safety margin
export const maxDuration = 60

const ALLOWED_TABLES = new Set([
  'linen_items', 'linen_categories', 'app_users', 'company_info', 'customers',
  'linen_forms', 'delivery_notes', 'billing_statements',
  'tax_invoices', 'quotations', 'product_checklists',
  'expenses', 'audit_logs', 'customer_categories',
  'carry_over_adjustments',
  'receipts', // 152 fix: ใบเสร็จรับเงิน (Feature 148)
  'legacy_documents', // Feature 161: archive of old NeoSME documents
  'app_settings', // 255: Facet vocabulary (admin-editable)
  'schedule_overrides', // 311 P2: schedule overrides (ลืม allowlist ตอน P2 → writes fail rollback)
  'route_plans', // P5.2: ลำดับวิ่งต่อวัน
  'vehicles', 'odometer_logs', 'maintenance_records', // 423 Phase A: fleet
  'rounds', 'crew', // 423 Phase B: rounds + crew
  'daily_trips', // 423 Phase B2: dispatch board
  'fuel_logs', // 423 งานติ๊ด: บันทึกการเติมน้ำมัน
  'saved_places', // 432.1: จุดที่บันทึก (ร้านอาหาร/ปั๊ม/จุดแวะ)
])

interface DbRequest {
  operation: 'insert' | 'update' | 'delete' | 'upsert'
  table: string
  data?: Record<string, unknown> | Record<string, unknown>[]
  match?: { column: string; value: string | number }
  // 390 C — batch match by id list (update/delete หลายแถวใน 1 call) → PATCH/DELETE ... col=in.(...)
  matchIn?: { column: string; values: (string | number)[] }
  onConflict?: string
}

export async function POST(request: NextRequest) {
  try {
    // Auth check: require x-fc-session header (set by client at login)
    const sessionUser = request.headers.get('x-fc-session')
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: DbRequest = await request.json()
    const { operation, table, data, match, matchIn, onConflict } = body

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: `Table "${table}" not allowed` }, { status: 400 })
    }

    if (!['insert', 'update', 'delete', 'upsert'].includes(operation)) {
      return NextResponse.json({ error: `Operation "${operation}" not allowed` }, { status: 400 })
    }

    let result: { error: unknown }

    switch (operation) {
      case 'insert':
        result = await supabaseAdmin.from(table).insert(data!)
        break
      case 'update':
        if (match) {
          result = await supabaseAdmin.from(table).update(data!).eq(match.column, match.value)
        } else if (matchIn) {
          // 390 C — empty list = no-op (กัน update ทั้งตารางโดยไม่ตั้งใจ)
          if (matchIn.values.length === 0) { result = { error: null }; break }
          result = await supabaseAdmin.from(table).update(data!).in(matchIn.column, matchIn.values)
        } else {
          return NextResponse.json({ error: 'match or matchIn required for update' }, { status: 400 })
        }
        break
      case 'delete':
        if (match) {
          result = await supabaseAdmin.from(table).delete().eq(match.column, match.value)
        } else if (matchIn) {
          if (matchIn.values.length === 0) { result = { error: null }; break }
          result = await supabaseAdmin.from(table).delete().in(matchIn.column, matchIn.values)
        } else {
          return NextResponse.json({ error: 'match or matchIn required for delete' }, { status: 400 })
        }
        break
      case 'upsert':
        result = await supabaseAdmin.from(table).upsert(data!, onConflict ? { onConflict } : undefined)
        break
      default:
        return NextResponse.json({ error: 'Unknown operation' }, { status: 400 })
    }

    if (result.error) {
      const errDetail = typeof result.error === 'object' && result.error !== null
        ? JSON.stringify(result.error)
        : String(result.error)
      console.error(`[API /db] ${operation} ${table}:`, errDetail)
      return NextResponse.json({ error: errDetail }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[API /db] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
