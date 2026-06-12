-- 429 — แบ่งงานลูกค้าไปรอบอื่นแบบประจำตามวันในสัปดาห์ (รอบหลัก + ข้อยกเว้นรายวัน)
-- เคสติ๊ด: IONA รอบหลัก SPA แต่เสาร์ไปรอบ V · ลูกค้า 45 รอบหลัก SPA แต่อาทิตย์ไปรอบ V
-- (รอบ V เสาร์-อาทิตย์ว่างเพราะ TTM/PMSO ราชการเปิด จ-ศ — เกลี่ยโหลดแบบประจำ ไม่ใช่ครั้งคราว)
-- shape: { "<weekday 0-6>": "<roundId>" } · 0=อาทิตย์ … 6=เสาร์ (ตรง scheduleDays) · {} = ไม่มีข้อยกเว้น

ALTER TABLE customers ADD COLUMN IF NOT EXISTS round_day_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN customers.round_day_overrides IS '429 — ข้อยกเว้นรอบรายวัน {weekday 0-6: roundId} · ชนะ round_id ในวันนั้น · {} = อยู่รอบหลักทุกวัน';
