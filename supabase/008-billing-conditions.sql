-- Migration: Billing conditions — 3 independent toggles
-- Date: 2026-03-14
-- Features: enablePerPiece, enableMinPerTrip + threshold, enableMinPerMonth
-- Replace radio (per_piece/monthly_flat) with 3 independent checkboxes

-- 1. Add new columns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS min_per_trip NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_per_piece BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_min_per_trip BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS min_per_trip_threshold NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_min_per_month BOOLEAN NOT NULL DEFAULT false;

-- 2. Migrate existing data: set flags based on current billing_model
UPDATE customers SET enable_per_piece = true, enable_min_per_month = false
  WHERE billing_model = 'per_piece';

UPDATE customers SET enable_per_piece = false, enable_min_per_month = true
  WHERE billing_model = 'monthly_flat';

-- 3. Set enable_min_per_trip for customers that had minPerTrip > 0
UPDATE customers SET enable_min_per_trip = true
  WHERE min_per_trip > 0;
