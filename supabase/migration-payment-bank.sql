-- Migration: Payment recording with bank account (Feature 82)
-- Run in Supabase SQL Editor

ALTER TABLE billing_statements
  ADD COLUMN IF NOT EXISTS paid_bank_id TEXT NOT NULL DEFAULT '';
