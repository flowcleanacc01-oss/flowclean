-- Migration: Transport fees + Waive toggle
-- Date: 2026-03-15
-- Features: enableWaive on customer, transportFeeTrip/Month on delivery_notes

-- 1. Customer: add enableWaive
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_waive BOOLEAN NOT NULL DEFAULT false;

-- 2. Delivery notes: add transport fee fields
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS transport_fee_trip NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS transport_fee_month NUMERIC NOT NULL DEFAULT 0;
