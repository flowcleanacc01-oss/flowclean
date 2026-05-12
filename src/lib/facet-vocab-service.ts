/**
 * 255 Phase 1.b — Facet Vocab Service
 *
 * Load/save FacetVocab from `app_settings` table (key='facet_vocab').
 * - Reads: anon supabase client (RLS allows SELECT)
 * - Writes: dbWrite proxy via /api/db (service_role)
 */
import { supabase } from './supabase'
import { DEFAULT_FACET_VOCAB, type FacetVocab } from './linen-vocabulary'

const FACET_VOCAB_KEY = 'facet_vocab'

async function dbWrite(params: {
  table: string
  operation: 'insert' | 'update' | 'delete' | 'upsert'
  data?: Record<string, unknown> | Record<string, unknown>[]
  match?: { column: string; value: string | number }
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

/**
 * Load FacetVocab from DB. Returns null if row not yet seeded.
 * Caller: if null → save DEFAULT_FACET_VOCAB + use defaults locally.
 */
export async function loadFacetVocab(): Promise<FacetVocab | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', FACET_VOCAB_KEY)
    .maybeSingle()
  if (error) {
    console.error('[facet-vocab] load failed:', error)
    return null
  }
  return (data?.value as FacetVocab) || null
}

/** Save FacetVocab to DB (upsert by key). Used by store init seed + admin UI saves. */
export async function saveFacetVocab(vocab: FacetVocab): Promise<void> {
  await dbWrite({
    table: 'app_settings',
    operation: 'upsert',
    data: {
      key: FACET_VOCAB_KEY,
      value: vocab as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    onConflict: 'key',
  })
}

/**
 * Get-or-seed: load from DB; if missing, seed with DEFAULT_FACET_VOCAB.
 * Returns the resolved vocab (DB value or defaults).
 */
export async function getOrSeedFacetVocab(): Promise<FacetVocab> {
  const fromDb = await loadFacetVocab()
  if (fromDb) return fromDb
  // Seed (fire-and-forget — okay if seed fails, use defaults locally)
  try {
    await saveFacetVocab(DEFAULT_FACET_VOCAB)
  } catch (err) {
    console.error('[facet-vocab] seed failed (will use defaults locally):', err)
  }
  return DEFAULT_FACET_VOCAB
}
