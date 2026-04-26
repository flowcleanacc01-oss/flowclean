-- Migration: Add bag count fields to linen_forms
-- จำนวนถุงกระสอบส่งซัก (draft) + จำนวนถุงแพคส่ง (delivered)

ALTER TABLE linen_forms ADD COLUMN IF NOT EXISTS bags_sent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE linen_forms ADD COLUMN IF NOT EXISTS bags_pack_count INTEGER NOT NULL DEFAULT 0;
