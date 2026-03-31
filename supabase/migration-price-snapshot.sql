-- Migration: Add price_snapshot to delivery_notes
-- Stores locked prices at DN creation time (from QT)
-- Run in Supabase SQL Editor

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS price_snapshot JSONB DEFAULT NULL;
