-- 427 — พิกัด GPS ลูกค้า + โรงงาน (จับคู่จุดจบเที่ยววิ่ง V2X → ชื่อสถานที่)
-- ลูกค้า: กรอกโดยวางลิงก์ Google Maps หรือยืนยันจากจุดจอดจริงใน tab เที่ยววิ่ง
-- โรงงาน: ใช้ label "ขยับรถที่โรงงาน/กลับโรงงาน" (ตั้งที่หน้าตั้งค่า → ข้อมูลบริษัท)
-- 0,0 = ยังไม่ตั้ง

ALTER TABLE customers ADD COLUMN IF NOT EXISTS gps_lat NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gps_lng NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS factory_lat NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS factory_lng NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN customers.gps_lat IS '427 — พิกัดหน้างานลูกค้า (จับคู่เที่ยววิ่ง GPS รัศมี ~150ม.) · 0=ยังไม่ตั้ง';
COMMENT ON COLUMN company_info.factory_lat IS '427 — พิกัดโรงงาน (label ขยับรถ/กลับโรงงาน) · 0=ยังไม่ตั้ง';
