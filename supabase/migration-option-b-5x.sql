-- Migration: Option B + Features 5.1-5.4
-- billing_statements: add billing_mode column
-- quotations: add customer_id + billing condition columns
-- Date: 2026-03-19
-- Run in Supabase Dashboard → SQL Editor

-- 1. billing_mode on billing_statements (default: by_item for backward compat with existing data)
ALTER TABLE billing_statements
  ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'by_item';

-- 2. quotations: customer_id FK + billing condition columns
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS customer_id TEXT,
  ADD COLUMN IF NOT EXISTS enable_per_piece BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_min_per_trip BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_per_trip NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enable_waive BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_per_trip_threshold NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enable_min_per_month BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_flat_rate NUMERIC DEFAULT 0;

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 4. Verify
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'billing_statements' AND column_name = 'billing_mode')
   OR (table_name = 'quotations' AND column_name IN ('customer_id', 'enable_per_piece', 'enable_min_per_trip', 'min_per_trip', 'enable_waive', 'min_per_trip_threshold', 'enable_min_per_month', 'monthly_flat_rate'))
ORDER BY table_name, column_name;
