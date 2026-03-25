-- Migration: Add customer_id FK to quotations table
-- Run in Supabase SQL Editor

-- 1. Add nullable customer_id column
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;

-- 2. Backfill: match existing QTs to customers by name
UPDATE quotations q
SET customer_id = c.id
FROM customers c
WHERE q.customer_id IS NULL
  AND LOWER(TRIM(q.customer_name)) = LOWER(TRIM(c.name));

-- 3. Check how many still unmatched (review before enforcing NOT NULL)
-- SELECT id, quotation_number, customer_name FROM quotations WHERE customer_id IS NULL;
