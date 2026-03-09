import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const isDev = process.env.NODE_ENV === 'development'

const ALL_TABLES: { table: string; pk: string; pkType: 'text' | 'int' }[] = [
  { table: 'audit_logs', pk: 'id', pkType: 'text' },
  { table: 'product_checklists', pk: 'id', pkType: 'text' },
  { table: 'tax_invoices', pk: 'id', pkType: 'text' },
  { table: 'billing_statements', pk: 'id', pkType: 'text' },
  { table: 'delivery_notes', pk: 'id', pkType: 'text' },
  { table: 'linen_forms', pk: 'id', pkType: 'text' },
  { table: 'quotations', pk: 'id', pkType: 'text' },
  { table: 'expenses', pk: 'id', pkType: 'text' },
  { table: 'customers', pk: 'id', pkType: 'text' },
  { table: 'company_info', pk: 'id', pkType: 'int' },
  { table: 'app_users', pk: 'id', pkType: 'text' },
  { table: 'linen_categories', pk: 'key', pkType: 'text' },
  { table: 'linen_items', pk: 'code', pkType: 'text' },
]

export async function POST(request: NextRequest) {
  if (!isDev) {
    return NextResponse.json({ error: 'Truncate is disabled in production' }, { status: 403 })
  }

  const sessionUser = request.headers.get('x-fc-session')
  if (!sessionUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    for (const { table, pk, pkType } of ALL_TABLES) {
      const sentinel = pkType === 'int' ? -1 : '__never__'
      const { error } = await supabaseAdmin.from(table).delete().neq(pk, sentinel)
      if (error) console.error(`[truncate] ${table}:`, error)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[truncate] Error:', err)
    return NextResponse.json({ error: 'Truncate failed' }, { status: 500 })
  }
}
