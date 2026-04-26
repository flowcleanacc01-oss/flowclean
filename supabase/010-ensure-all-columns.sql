-- Migration: Ensure ALL customer + delivery_note columns exist
-- Date: 2026-03-15
-- Safety-net: adds any columns that might be missing from previous migrations

-- Customers — all billing condition fields
ALTER TABLE customers ADD COLUMN IF NOT EXISTS min_per_trip NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_per_piece BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_min_per_trip BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_waive BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS min_per_trip_threshold NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_min_per_month BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS selected_bank_account_id TEXT DEFAULT '';

-- Delivery notes — transport fees + print/bill flags
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS is_printed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS is_billed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS transport_fee_trip NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS transport_fee_month NUMERIC NOT NULL DEFAULT 0;

-- Set defaults for existing customer data
UPDATE customers SET enable_per_piece = true, enable_min_per_month = false
  WHERE billing_model = 'per_piece' AND enable_per_piece = false;
UPDATE customers SET enable_per_piece = false, enable_min_per_month = true
  WHERE billing_model = 'monthly_flat' AND enable_min_per_month = false;
