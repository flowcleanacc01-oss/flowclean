-- 423 งานติ๊ด B-1: Capacity target ต่อรอบ (กระสอบ)
-- ติ๊ด track: รอบกลางคืน 3 รอบ ~160 กระสอบปกติ · 200=เริ่มเยอะ · 250=เตือนบริหารเวลา · <เป้า=เสี่ยงต้นทุน
-- เทียบกับ load จริง (sum ถุง/กระสอบ ใน DailyTrip B2) → แถบเตือน capacity ในกระดานจ่ายงาน

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS capacity_target NUMERIC NOT NULL DEFAULT 0;  -- 0 = ไม่ตั้งเป้า

COMMENT ON COLUMN rounds.capacity_target IS '423 B-1 — ความจุเป้าหมายต่อรอบ (กระสอบ) · 0=ไม่ตั้ง · เทียบ load จาก DailyTrip';
