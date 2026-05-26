-- 377 — Schedule end condition (เหมือน Google Calendar recurrence end)
--
-- schedule_end_date: schedule วิ่งถึงวันนี้ (inclusive) แล้วหยุด · NULL = ไม่หยุด (default)
-- schedule_end_count: display hint "สิ้นสุดหลัง N ครั้ง" — app แปลงเป็น schedule_end_date ตอนเซฟ
--
-- ใช้กับ: ลูกค้าแจ้งยกเลิกล่วงหน้า (ตั้ง end date เดือนหน้าไว้) + ปฏิทินขนส่ง "ลบ chip → อันนี้+ที่ตามมา"

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS schedule_end_date DATE,
  ADD COLUMN IF NOT EXISTS schedule_end_count INTEGER;

COMMENT ON COLUMN customers.schedule_end_date IS '377 — schedule สิ้นสุดวันนี้ (inclusive) · NULL = ไม่หยุด';
COMMENT ON COLUMN customers.schedule_end_count IS '377 — display hint สิ้นสุดหลัง N ครั้ง (แปลงเป็น schedule_end_date ตอนเซฟ)';
