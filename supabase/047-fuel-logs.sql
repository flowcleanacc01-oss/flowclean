-- 423 งานติ๊ด: บันทึกการเติมน้ำมัน (Fuel Log) + เบิกเงินคนขับ + ผูกบัญชี
-- คนขับสำรองจ่าย → เบิกคืน · หลักฐาน 3 รูป (ใบกำกับ/slip โอน/หน้าปัดเข็มน้ำมัน) กันทุจริต
-- writes ผ่าน service_role · reads ผ่าน anon (RLS แบบ rounds/crew 045) · รูปเก็บ bucket odometer-photos (เพิ่ม path prefix fuel)

CREATE TABLE IF NOT EXISTS fuel_logs (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',              -- ISO yyyy-mm-dd
  liters NUMERIC NOT NULL DEFAULT 0,
  price_per_liter NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,          -- ยอดเงิน (บาท)
  odometer NUMERIC NOT NULL DEFAULT 0,        -- เลขไมล์ตอนเติม (0 = ไม่ระบุ) → คำนวณ km/ลิตร
  driver_id TEXT NOT NULL DEFAULT '',         -- คนขับ/คนจ่าย (crew) — สำหรับ track เบิกคืน
  station TEXT NOT NULL DEFAULT '',           -- ปั๊ม
  fuel_type TEXT NOT NULL DEFAULT 'ดีเซล',
  tax_invoice_number TEXT NOT NULL DEFAULT '', -- เลขใบกำกับภาษี (เอกสารบัญชี)
  paid_by TEXT NOT NULL DEFAULT 'driver',     -- 'driver' (สำรองจ่าย) | 'company'
  is_reimbursed BOOLEAN NOT NULL DEFAULT false, -- เบิกคืนคนขับแล้ว
  reimbursed_date TEXT NOT NULL DEFAULT '',
  expense_id TEXT NOT NULL DEFAULT '',        -- ผูก Expense หมวด fuel ('' = ไม่ผูก)
  receipt_photo_path TEXT NOT NULL DEFAULT '', -- ใบกำกับภาษี
  slip_photo_path TEXT NOT NULL DEFAULT '',    -- slip โอนเงิน
  gauge_photo_path TEXT NOT NULL DEFAULT '',   -- หน้าปัดเข็มน้ำมันหลังเติม (กันทุจริต)
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_fuel_logs" ON fuel_logs FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_fuel_logs" ON fuel_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_fuel_logs_vehicle ON fuel_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_date ON fuel_logs(date);

-- เพิ่มหมวด 'fuel' (ค่าน้ำมันรถ) ใน expenses — เดิม CHECK ไม่มี → insert จะ error 23514 (บทเรียน FIELD_MAP→CHECK)
-- ชื่อ constraint จริง = chk_expenses_category (002-security-hardening.sql:79)
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_category;
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_category
  CHECK (category IN ('chemicals','water','electricity','labor','transport','maintenance','rent','fuel','other'));

COMMENT ON TABLE fuel_logs IS '423 งานติ๊ด — บันทึกการเติมน้ำมัน + เบิกเงินคนขับ + หลักฐาน 3 รูป (กันทุจริต) + ผูก Expense';
