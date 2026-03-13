-- Migration: Delivery Note isPrinted + isBilled flags
-- Date: 2026-03-13
-- Replaces the old linear status flow (pending→delivered→acknowledged) with boolean flags

-- 1. Add isPrinted and isBilled columns
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT false;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS is_billed BOOLEAN DEFAULT false;

-- 2. Migrate existing data: mark acknowledged/delivered as printed
UPDATE delivery_notes SET is_printed = true WHERE status IN ('delivered', 'acknowledged');

-- 3. Mark delivery notes that are already in billing statements as billed
UPDATE delivery_notes SET is_billed = true
WHERE id IN (
  SELECT unnest(delivery_note_ids::text[]) FROM billing_statements
);
