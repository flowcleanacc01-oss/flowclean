-- Migration: Add discount and extra charge fields to delivery_notes
-- Run in Supabase SQL Editor

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_note   TEXT          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS extra_charge    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_charge_note TEXT        NOT NULL DEFAULT '';
