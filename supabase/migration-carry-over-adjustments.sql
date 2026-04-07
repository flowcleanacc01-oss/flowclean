-- Migration: Carry-over Adjustments (51-53)
-- Run in Supabase SQL Editor
--
-- รายงานผ้าค้าง/คืน + Tool ปรับยอด (Adjust/Reset)
-- - Adjust: delta apply ทุกเคสเท่ากัน
-- - Reset: overwrite checkpoint ทุกเคสเป็น 0 (ignore LF/adjustments ก่อนวัน reset)

CREATE TABLE IF NOT EXISTS carry_over_adjustments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'adjust',          -- 'adjust' | 'reset'
  items JSONB NOT NULL DEFAULT '[]',             -- [{ code, delta }]
  reason_category TEXT NOT NULL DEFAULT 'other', -- 'compensation' | 'human_error' | 'system_correction' | 'other'
  reason TEXT NOT NULL DEFAULT '',
  show_in_customer_report BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  history JSONB NOT NULL DEFAULT '[]',           -- edit history (Option B)
  is_deleted BOOLEAN NOT NULL DEFAULT false      -- soft delete
);

-- Index: faster carry-over lookup by customer + date range
CREATE INDEX IF NOT EXISTS idx_carry_over_adj_customer_date
  ON carry_over_adjustments(customer_id, date);

-- RLS: same pattern as other tables (anon read, service_role write)
ALTER TABLE carry_over_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read" ON carry_over_adjustments;
CREATE POLICY "anon_read" ON carry_over_adjustments FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_write" ON carry_over_adjustments;
CREATE POLICY "service_write" ON carry_over_adjustments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
