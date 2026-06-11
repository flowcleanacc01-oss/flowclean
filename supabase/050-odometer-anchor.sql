-- 428 — ไมล์ปัจจุบัน auto จาก GPS: เก็บ "วันที่ของเลขไมล์ล่าสุด" (anchor)
-- สูตร: ไมล์ประมาณ = current_odometer (ฐาน ณ วัน anchor) + Σ ระยะวิ่งจาก V2X หลังวัน anchor
-- '' = ยังไม่รู้วัน (ระบบจะ derive จาก odometer_logs/fuel_logs/maintenance ล่าสุดฝั่ง client)

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS odometer_anchor_date TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN vehicles.odometer_anchor_date IS '428 — วันที่ (yyyy-mm-dd) ของ current_odometer · ฐานคำนวณไมล์ประมาณจาก GPS · ตั้งใหม่ทุกครั้งที่กรอกไมล์จริง';
