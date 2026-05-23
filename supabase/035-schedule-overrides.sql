-- 311 P2 — Schedule Override + extended schedule types
--
-- เพิ่ม flexibility ของ schedule-based SD audit:
-- - skip: ลูกค้าขอข้ามคิว (ผ้าน้อย / ไม่เข้า min-per-trip)
-- - extra: เพิ่มคิวเสริม (ปริมาณเยอะกว่าปกติ)
-- - reschedule: เลื่อนคิว (skip + extra ผูกกัน via rescheduled_link_id)
--
-- + customers fields สำหรับ every_n_days และ biweekly schedule types

-- ===== customers: เพิ่ม fields สำหรับ extended schedule types =====
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS schedule_every_n_days INTEGER,        -- ทุก N วัน (every_n_days)
  ADD COLUMN IF NOT EXISTS schedule_biweekly_anchor_week INTEGER; -- 0 หรือ 1 (biweekly)

COMMENT ON COLUMN customers.schedule_every_n_days IS '311 P2.1 — step (วัน) สำหรับ scheduleType=every_n_days';
COMMENT ON COLUMN customers.schedule_biweekly_anchor_week IS '311 P2.1 — anchor week parity (0/1) สำหรับ biweekly';

-- ===== schedule_overrides table =====
CREATE TABLE IF NOT EXISTS schedule_overrides (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('skip', 'extra', 'reschedule_skip', 'reschedule_add')),
  reason TEXT NOT NULL DEFAULT '',
  rescheduled_link_id TEXT,   -- pair link สำหรับ reschedule_skip ↔ reschedule_add
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_schedule_overrides_customer_date
  ON schedule_overrides(customer_id, date);

CREATE INDEX IF NOT EXISTS idx_schedule_overrides_link
  ON schedule_overrides(rescheduled_link_id)
  WHERE rescheduled_link_id IS NOT NULL;

COMMENT ON TABLE schedule_overrides IS '311 P2 — manual overrides ของ recurring schedule (skip/extra/reschedule)';
