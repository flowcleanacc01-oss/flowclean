-- Migration: Create linen_categories table
-- Date: 2026-03-09

CREATE TABLE IF NOT EXISTS linen_categories (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Seed with default categories
INSERT INTO linen_categories (key, label, sort_order) VALUES
  ('towel', 'ผ้าขนหนู', 1),
  ('bedsheet', 'ผ้าปูที่นอน', 2),
  ('duvet_cover', 'ปลอกดูเว่', 3),
  ('duvet_insert', 'ไส้ดูเว่', 4),
  ('mattress_pad', 'รองกันเปื้อน', 5),
  ('other', 'อื่นๆ', 6)
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE linen_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_linen_categories" ON linen_categories FOR SELECT USING (true);
CREATE POLICY "service_write_linen_categories" ON linen_categories FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
