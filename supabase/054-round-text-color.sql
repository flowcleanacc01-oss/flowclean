-- 442 — สีตัวอักษรบน round badge (เผื่อพื้นสีอ่อน/ขาว เช่น รอบ SWD)
-- ไม่ตั้งค่า (NULL) = ใช้สีขาวตามเดิม
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS text_color text;
