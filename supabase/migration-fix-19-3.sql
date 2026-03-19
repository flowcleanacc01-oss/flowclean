-- Fix: ensure billing_statements + tax_invoices have all required columns
-- Root cause: is_printed / is_exported / is_paid might be missing → Supabase update fails
-- Date: 2026-03-19
-- Run in Supabase Dashboard → SQL Editor

-- Step 1: Add missing columns (safe — IF NOT EXISTS)
ALTER TABLE billing_statements
  ADD COLUMN IF NOT EXISTS is_printed  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_exported BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tax_invoices
  ADD COLUMN IF NOT EXISTS is_printed  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_exported BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_paid     BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Step 3: Verify — should return 5 rows (3 for tax_invoices + 2 for billing_statements)
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('billing_statements', 'tax_invoices')
  AND column_name IN ('is_printed', 'is_exported', 'is_paid')
ORDER BY table_name, column_name;
