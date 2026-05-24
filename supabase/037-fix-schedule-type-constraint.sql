-- 361 — Fix: customers_schedule_type_check ไม่อนุญาต every_n_days / biweekly
--
-- migration 030 สร้าง inline CHECK (schedule_type IN ('none','weekly','daily'))
-- P2.1 (035) เพิ่ม every_n_days + biweekly ใน types + UI แต่ "ลืมอัปเดต constraint นี้"
-- → save ลูกค้าที่ตั้ง "วันเว้นวัน"(every_n_days) / "2 สัปดาห์ครั้ง"(biweekly)
--   โดน 23514 (customers_schedule_type_check) reject → rollback
--
-- แก้: relax constraint ให้ครบ 5 values (additive · ข้อมูลเดิมทุกแถวผ่าน constraint ใหม่อยู่แล้ว)

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_schedule_type_check;

ALTER TABLE customers ADD CONSTRAINT customers_schedule_type_check
  CHECK (schedule_type IS NULL OR schedule_type IN ('none', 'daily', 'every_n_days', 'weekly', 'biweekly'));
