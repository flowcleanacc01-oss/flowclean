-- Migration: Bank accounts + Customer categories + Selected bank per customer
-- Date: 2026-03-13
-- Features: Multi-bank accounts in company_info, per-customer bank selection, customer categories

-- 1. Add bank_accounts JSONB column to company_info
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS bank_accounts JSONB DEFAULT '[]'::jsonb;

-- 2. Add selected_bank_account_id column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS selected_bank_account_id TEXT DEFAULT '';

-- 3. Create customer_categories table (mirrors linen_categories pattern)
CREATE TABLE IF NOT EXISTS customer_categories (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Insert default customer categories
INSERT INTO customer_categories (key, label, sort_order) VALUES
  ('hotel', 'โรงแรม', 1),
  ('spa', 'สปา', 2),
  ('clinic', 'คลินิก', 3),
  ('restaurant', 'ร้านอาหาร', 4),
  ('other', 'อื่นๆ', 5)
ON CONFLICT (key) DO NOTHING;

-- 5. RLS for customer_categories (same pattern as linen_categories)
ALTER TABLE customer_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_categories_read" ON customer_categories
  FOR SELECT USING (true);

CREATE POLICY "customer_categories_write" ON customer_categories
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role'
  );
