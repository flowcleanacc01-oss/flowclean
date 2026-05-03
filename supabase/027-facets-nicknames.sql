-- Migration 027 — 213.2 Phase 1.1: Facets + Nicknames
-- Optional fields for faceted classification + per-customer nickname
-- Backward compat: ของเดิมยังใช้งานได้ปกติ (ทุก field nullable + default)

-- ============================================================
-- linen_items: เพิ่ม facets (jsonb) + facet_key (text, indexed)
-- ============================================================
ALTER TABLE linen_items
  ADD COLUMN IF NOT EXISTS facets JSONB DEFAULT NULL;

ALTER TABLE linen_items
  ADD COLUMN IF NOT EXISTS facet_key TEXT DEFAULT NULL;

-- Index สำหรับ dup detection (เร็วกว่า scan ทั้ง table)
-- Phase 2+ จะ enforce UNIQUE — Phase 1.1 ปล่อยไว้เป็น index ปกติก่อน
CREATE INDEX IF NOT EXISTS idx_linen_items_facet_key
  ON linen_items(facet_key)
  WHERE facet_key IS NOT NULL;

COMMENT ON COLUMN linen_items.facets IS
  '213.2 Phase 1.1: structured facets {type, application, size, sizeUnit, color, weight, material, pattern, variant} — optional, see linen-vocabulary.ts';

COMMENT ON COLUMN linen_items.facet_key IS
  '213.2 Phase 1.1: deterministic hash of facets — facet ชุดเดียวกัน = key เดียวกัน → กัน duplicate';

-- ============================================================
-- customers: เพิ่ม item_nicknames (jsonb)
-- Map: { catalog_code: "ชื่อย่อที่ลูกค้านี้เรียก" }
-- ใช้ render ใน LF/SD/QT/print เท่านั้น — reports/audit ใช้ canonical
-- ============================================================
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS item_nicknames JSONB DEFAULT NULL;

COMMENT ON COLUMN customers.item_nicknames IS
  '213.2 Phase 1.1: per-customer item display alias — { code: "nickname" }, ใช้ render display layer เท่านั้น';

-- ============================================================
-- Verification queries (รันเช็คหลัง migration)
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'linen_items' AND column_name IN ('facets', 'facet_key');
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'customers' AND column_name = 'item_nicknames';
