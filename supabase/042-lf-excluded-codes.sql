-- 404 — LF row delete (Universal): ซ่อน/ลบรายการผ้าออกจาก LF ใบเดียว
--   เก็บ codes ที่ user ลบทิ้ง เพื่อกันไม่ให้ item ที่ยังอยู่ใน QT เด้งกลับมาโชว์ใน LF ใบนั้น
--   (grid ดึงรายการจาก QT ตัวจริง + orphan-safe → ถ้าไม่ track ว่า "ลบแล้ว" จะกลับมาเป็นแถวเปล่า)
--   nullable jsonb (array of string) — LF เก่าที่ไม่มีค่า = null = ไม่มีอะไรถูกซ่อน
alter table linen_forms add column if not exists excluded_codes jsonb;
