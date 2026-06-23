-- 470 — เวลาที่อ่านไมล์ตอนบันทึกประวัติซ่อม/บำรุง (Time Aware ให้ครบทั้งระบบ)
-- ปัญหาเดิม: maintenance_records มีแต่ date + odometer (ไม่มีเวลา)
--   → ตอนบันทึกซ่อม+ไมล์ปัจจุบัน ระบบตั้ง vehicle anchor ด้วย anchorTime='' → ข้ามระยะ GPS ทั้งวันนั้น (conservative)
--   ไม่สอดคล้องกับการบันทึกไมล์ปกติ (odometer_logs.recorded_time — 446)
-- แก้: เก็บ "เวลา" ของไมล์ที่บันทึกตอนซ่อม → ใช้ตั้ง odometer_anchor_time + เป็น anchor candidate แบบ time-aware

ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS recorded_time TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN maintenance_records.recorded_time IS '470 — เวลา (HH:MM) ที่อ่านไมล์ตอนบันทึกซ่อม/บำรุง · ใช้ตั้ง odometer_anchor_time (เหมือน odometer_logs.recorded_time 446) · '''' = ไม่รู้เวลา';
