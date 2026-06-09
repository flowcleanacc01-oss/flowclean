-- 423 งานติ๊ด B-2: กลุ่มเจ้าของเดียวกัน (owner group) — สำหรับ skip-queue exception
-- ติ๊ด: ลูกค้าเจ้าของเดียวกัน/อยู่ใกล้กัน (เช่น SEN/SEN2/J19/SV · รามบุตรี SWD/WOV/VLB/VLR/TRD)
-- หากสาขาใดสาขาหนึ่งไม่ส่ง (ถุง=0) ไม่ใช่ข้ามคิว ถ้าสาขาอื่นในกลุ่มส่งแล้ว → ไม่ flag

ALTER TABLE customers ADD COLUMN IF NOT EXISTS owner_group TEXT NOT NULL DEFAULT '';  -- '' = ไม่มีกลุ่ม

COMMENT ON COLUMN customers.owner_group IS '423 B-2 — กลุ่มเจ้าของเดียวกัน (tag) · ใช้ยกเว้น skip-queue alert เมื่อสาขาอื่นในกลุ่มส่งแล้ว';
