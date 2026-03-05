import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED_TABLES = new Set([
  'linen_items', 'app_users', 'company_info', 'customers',
  'linen_forms', 'delivery_notes', 'billing_statements',
  'tax_invoices', 'quotations', 'product_checklists',
  'expenses', 'audit_logs',
])

interface DbRequest {
  operation: 'insert' | 'update' | 'delete' | 'upsert'
  table: string
  data?: Record<string, unknown> | Record<string, unknown>[]
  match?: { column: string; value: string | number }
  onConflict?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: DbRequest = await request.json()
    const { operation, table, data, match, onConflict } = body

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
        if (!match) return NextResponse.json({ error: 'match required for update' }, { status: 400 })
        result = await supabaseAdmin.from(table).update(data!).eq(match.column, match.value)
        break
      case 'delete':
        if (!match) return NextResponse.json({ error: 'match required for delete' }, { status: 400 })
        result = await supabaseAdmin.from(table).delete().eq(match.column, match.value)
        break
      case 'upsert':
        result = await supabaseAdmin.from(table).upsert(data!, onConflict ? { onConflict } : undefined)
        break
      default:
        return NextResponse.json({ error: 'Unknown operation' }, { status: 400 })
    }

    if (result.error) {
      console.error(`[API /db] ${operation} ${table}:`, result.error)
      return NextResponse.json({ error: String(result.error) }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[API /db] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
