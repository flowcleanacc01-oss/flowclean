-- 446 — เวลาของ anchor ไมล์ (คนขับถ่ายเลขไมล์ก่อนออกรถตอนเช้า/กลางคืน)
-- ปัญหาเดิม: ระบบข้ามระยะวิ่ง "วันที่กรอกไมล์" ทั้งวัน (ไม่รู้ว่ากรอกตอนไหน → conservative)
--   → ถ่ายตอนต้นวันแล้ววิ่งทั้งวัน = ไมล์ขาดไป 1 วันเต็ม
-- แก้: เก็บ "เวลา" ของ anchor → วัน anchor นับเฉพาะระยะของเที่ยวที่ออกหลังเวลานั้น (ไม่ข้ามข้อมูลวันเดียวกัน)

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS odometer_anchor_time TEXT NOT NULL DEFAULT '';
ALTER TABLE odometer_logs ADD COLUMN IF NOT EXISTS recorded_time TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN vehicles.odometer_anchor_time IS '446 — เวลา (HH:MM) ที่อ่าน current_odometer · วัน anchor นับเฉพาะระยะวิ่งหลังเวลานี้ · '''' = ไม่รู้เวลา (ข้ามวัน anchor แบบเดิม)';
COMMENT ON COLUMN odometer_logs.recorded_time IS '446 — เวลา (HH:MM) ที่ถ่าย/อ่านไมล์ · ใช้ตั้ง odometer_anchor_time ให้รถ';
