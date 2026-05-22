-- 330 Phase A — Aggregate Snapshot (per-LF)
--
-- Pattern เดียวกับ workflow_mode (029) — snapshot ของ customer.aggregate_size_groups
-- ที่บันทึกตอน LF สร้าง เพื่อกัน drift เมื่อ customer toggle config ภายหลัง
--
-- linen_forms.aggregate_snapshot: jsonb
--   { [groupKey]: { col2Mode: 'aggregate'|'per_row', col5Mode: 'aggregate'|'per_row' } }
--
-- ใช้ใน getCarryOver(): ถ้า LF มี snapshot → ใช้ snapshot แต่ละใบ
-- ถ้าไม่มี (LF เก่า) → fallback ไปใช้ customer.aggregate_size_groups ปัจจุบัน
--
-- Carry-over logic (group-aware):
--   - Mode 1 (col6 - col5) + col5Mode='aggregate' → group sum store ที่ anchor
--   - Mode 2 (col6 - col2-col3) + col2Mode='aggregate' → group sum store ที่ anchor
--   - Mode 3 (col4 - col5) + col5Mode='aggregate' → group sum store ที่ anchor
--   - Mode 4 (col4 - col2-col3) + col2Mode='aggregate' → group sum store ที่ anchor
--   - ที่เหลือ → per-row เหมือนเดิม
--
-- แก้ infinity bug: ก่อนนี้ row-level diff ทำให้ค่าสะสมไป infinity เมื่อ
-- col5 (หรือ col2) เก็บที่ anchor เพียง row เดียว แต่ col6 (หรือ col4)
-- กระจายทุก row → tally หักล้างกันไม่ได้ → runaway ทั้ง 2 ทิศ

ALTER TABLE linen_forms
  ADD COLUMN IF NOT EXISTS aggregate_snapshot JSONB;
