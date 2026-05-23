-- 340.3 — Carry-over Adjustment: Aggregate Snapshot + Auto-balanced flag
--
-- Pattern เดียวกับ 032 (LF aggregate_snapshot) — adj record ที่ถูกสร้าง
-- ต้อง snapshot aggregate config ของ customer ตอน save เพื่อกัน drift
-- เมื่อ customer toggle col2Mode/col5Mode ภายหลัง
--
-- ใช้กับ:
--   - getCarryOver() : ตรวจ adj snapshot vs customer ปัจจุบัน (audit/UI)
--   - AggregateModeAudit (330 Phase B) : extend ให้ครอบคลุม adj ในอนาคต
--
-- auto_balanced_anchor:
--   true  = adj นี้สร้างด้วย "redistribute pattern" (เคส 42)
--           user ใส่ delta per-size + ระบบ auto-fill anchor = -sum(non-anchor)
--           → group sum คงที่ (ไม่ใช่ "add" ผ้าค้างใหม่)
--   false = adj นี้ user ใส่ delta ตรงๆ (อาจเปลี่ยน group sum)

ALTER TABLE carry_over_adjustments
  ADD COLUMN IF NOT EXISTS aggregate_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS auto_balanced_anchor BOOLEAN DEFAULT FALSE;
