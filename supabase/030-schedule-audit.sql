-- 311 — Schedule-Based SD Audit (Phase 1: P1+P3 per Option B)
--
-- customers.schedule_type: 'none' (default, skip audit) | 'weekly' | 'daily'
--   - none: ลูกค้ายังไม่ setup → ไม่อยู่ใน audit
--   - weekly: ส่งตามวันในสัปดาห์ (use schedule_days = [1,3,5] = จ/พ/ศ)
--   - daily: ส่งทุกวัน (ignore schedule_days)
--
-- customers.schedule_days: int[] (0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์)
--   - ใช้กับ schedule_type='weekly' เท่านั้น
--
-- customers.schedule_start_date: DATE — วันที่เริ่ม schedule
--   - User ระบุได้ (อาจเป็นเดือนที่กำลัง key ก็ได้)
--   - AI auto-detect pattern: scan SD 60 วันล่าสุด → suggest days
--
-- customers.schedule_note: หมายเหตุ schedule (free text)
--
-- delivery_notes.is_extra_round: รอบเสริม (urgent/pre-delivery)
--   - false (default) = รอบนัดหมายปกติ
--   - true = รอบเสริม (ไม่นับใน schedule audit)
--   - Auto-suggest: ถ้าวันนั้นมี SD อยู่แล้ว → suggest true

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'none' CHECK (schedule_type IN ('none', 'weekly', 'daily')),
  ADD COLUMN IF NOT EXISTS schedule_days SMALLINT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schedule_start_date DATE,
  ADD COLUMN IF NOT EXISTS schedule_note TEXT DEFAULT '';

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS is_extra_round BOOLEAN DEFAULT false NOT NULL;
