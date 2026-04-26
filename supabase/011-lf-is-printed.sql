-- Migration: Add is_printed to linen_forms
-- Run in Supabase SQL Editor

ALTER TABLE linen_forms
  ADD COLUMN IF NOT EXISTS is_printed BOOLEAN NOT NULL DEFAULT false;
