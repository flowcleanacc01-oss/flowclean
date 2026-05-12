-- Migration 028 — 255 Phase 1: Facet vocabulary editable storage
-- Generic key-value app settings table — initial use case: facet_vocab
-- (admin UI in next phase will CRUD this row's JSONB value)

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT
);

COMMENT ON TABLE app_settings IS
  'Generic key-value app config — JSONB value for schema-less data.
   Current use: facet_vocab (Wizard 2.0 vocabulary, admin-editable).
   Future use: other app-level config (e.g., feature flags, defaults).';

COMMENT ON COLUMN app_settings.value IS
  'JSONB content — schema depends on key.
   facet_vocab schema: { version, types, applications, colors, weights,
   materials, patterns, treatments, sizes:{bed,pillow,towel,uniform,generic}, sizeUnits }';

-- RLS: anon reads allowed (for wizard at runtime),
-- writes via service_role only (admin UI uses /api/db proxy)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings: anon read" ON app_settings;
CREATE POLICY "app_settings: anon read" ON app_settings FOR SELECT USING (true);

-- ============================================================
-- Verification (run after migration)
-- ============================================================
-- SELECT key, jsonb_pretty(value), updated_at FROM app_settings;
