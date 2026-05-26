/**
 * 375.1 — Form Template Service
 *
 * บันทึก/โหลด "ฟอร์มกลาง" templates จาก `app_settings` table (key='form_templates').
 * reuse pattern เดียวกับ facet-vocab-service (ไม่ต้อง migration — app_settings มีแล้ว).
 * - Reads: anon supabase client (RLS allows SELECT)
 * - Writes: dbWrite proxy via /api/db (service_role)
 */
import { supabase } from './supabase'

const FORM_TEMPLATES_KEY = 'form_templates'

export interface FormTemplate {
  id: string
  name: string
  formType: 'checklist' | 'lf'
  showCustomer: boolean
  showDate: boolean
  printMode: 'a4-2up' | 'a4'   // 381: a5 → a4 (template เก่าที่เป็น 'a5' ถูก migrate ตอนโหลด)
  sheets: { title: string; codes: string[] }[]
  updatedAt: string
}

async function dbWrite(params: {
  table: string
  operation: 'upsert'
  data?: Record<string, unknown>
  onConflict?: string
}): Promise<void> {
  const sessionStr = typeof window !== 'undefined' ? sessionStorage.getItem('flowclean_session') : null
  const sessionUser = sessionStr ? JSON.parse(sessionStr)?.userId || '' : ''
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-fc-session': sessionUser },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `DB write failed: ${res.status}`)
  }
}

/** โหลด templates ทั้งหมด (คืน [] ถ้ายังไม่มี) */
export async function loadFormTemplates(): Promise<FormTemplate[]> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', FORM_TEMPLATES_KEY)
    .maybeSingle()
  if (error) {
    console.error('[form-templates] load failed:', error)
    return []
  }
  return (data?.value as FormTemplate[]) || []
}

/** บันทึก templates ทั้ง array (upsert by key) */
export async function saveFormTemplates(templates: FormTemplate[]): Promise<void> {
  await dbWrite({
    table: 'app_settings',
    operation: 'upsert',
    data: {
      key: FORM_TEMPLATES_KEY,
      value: templates as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    onConflict: 'key',
  })
}
