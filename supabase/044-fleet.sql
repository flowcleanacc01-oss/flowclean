-- 423 Phase A — Fleet & Compliance (ฟลีตรถ + ปฏิบัติตามกฎหมาย + บำรุงเชิงป้องกัน)
-- รถ 4 คัน (A B C D) · ประกัน/พ.ร.บ./ภาษี/ตรวจสภาพ + PM ตามระยะไมล์ + ประวัติซ่อม
-- writes ผ่าน service_role (/api/db) · reads ผ่าน anon (RLS allow SELECT) — ตามแบบ receipts (025)

-- ── vehicles ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL DEFAULT '',            -- ชื่อย่อ A B C D
  license_plate TEXT NOT NULL DEFAULT '',   -- ทะเบียน (ชื่อจริง)
  brand TEXT NOT NULL DEFAULT '',
  usage_type TEXT NOT NULL DEFAULT '',
  registered_date TEXT NOT NULL DEFAULT '', -- ISO yyyy-mm-dd ('' = ไม่ทราบ) → คำนวณอายุ 7 ปี (ตรวจสภาพ)
  insurance_company TEXT NOT NULL DEFAULT '',
  insurance_class TEXT NOT NULL DEFAULT '',
  insurance_expiry TEXT NOT NULL DEFAULT '',  -- ประกันภาคสมัครใจ
  act_expiry TEXT NOT NULL DEFAULT '',        -- พ.ร.บ.
  tax_expiry TEXT NOT NULL DEFAULT '',        -- ภาษีรถ
  inspection_expiry TEXT NOT NULL DEFAULT '', -- ตรวจสภาพ ตรอ.
  current_odometer NUMERIC NOT NULL DEFAULT 0,
  service_interval_km NUMERIC NOT NULL DEFAULT 8000,
  next_service_odometer NUMERIC NOT NULL DEFAULT 0, -- 0 = ยังไม่ตั้ง
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── odometer_logs (บันทึกเลขไมล์ — ถ่ายรูปหน้าปัดตอนออกงาน) ──
CREATE TABLE IF NOT EXISTS odometer_logs (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT '',
  odometer NUMERIC NOT NULL DEFAULT 0,
  fuel_level TEXT NOT NULL DEFAULT '',  -- หมายเหตุน้ำมัน (จากหน้าปัด)
  photo_path TEXT NOT NULL DEFAULT '',  -- path ใน bucket (signed URL on demand)
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── maintenance_records (ประวัติงานซ่อม/บำรุง) ──
CREATE TABLE IF NOT EXISTS maintenance_records (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT '',
  odometer NUMERIC NOT NULL DEFAULT 0,        -- ระยะที่ทำ (0 = ไม่ระบุ)
  type TEXT NOT NULL DEFAULT '',              -- น้ำมันเครื่อง/ผ้าเบรคหน้า/...
  description TEXT NOT NULL DEFAULT '',
  cost NUMERIC NOT NULL DEFAULT 0,
  expense_id TEXT NOT NULL DEFAULT '',        -- ผูก Expense ('' = ไม่ผูก)
  next_due_odometer NUMERIC NOT NULL DEFAULT 0, -- 0 = ไม่ตั้ง (เช่น ผ้าเบรค set เอง)
  created_by TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS (anon read · service_role all) — ตามแบบ receipts (025)
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE odometer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_vehicles" ON vehicles FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_vehicles" ON vehicles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_odometer_logs" ON odometer_logs FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_odometer_logs" ON odometer_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_maintenance_records" ON maintenance_records FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_maintenance_records" ON maintenance_records FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_odometer_logs_vehicle ON odometer_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_odometer_logs_date ON odometer_logs(date);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_vehicle ON maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_date ON maintenance_records(date);

-- Seed รถ 4 คัน (ติ๊ดยืนยัน 2026-06-08) · insurance_expiry = ประกันชั้น 1 · ON CONFLICT idempotent
-- หมายเหตุ: พ.ร.บ./ภาษี/ตรวจสภาพ + ปีจดทะเบียน ยังไม่มีข้อมูล → ติ๊ดกรอกเพิ่มในแอป
INSERT INTO vehicles
  (id, code, license_plate, brand, usage_type, insurance_company, insurance_class, insurance_expiry,
   current_odometer, service_interval_km, next_service_odometer, is_active)
VALUES
  ('veh-a', 'A', '3ฒพ-5682', 'Toyota Hilux Revo Standard Cab + ตู้ทึบ', 'พาณิชย์', 'ชับบ์ สามัคคี',        'ชั้น 1', '2026-09-29', 175275, 8000, 177000, true),
  ('veh-b', 'B', '3ฒอ-1972', 'Toyota Hilux Revo Standard Cab + ตู้ทึบ', 'พาณิชย์', 'คุ้มภัย โตเกียวมารีน', 'ชั้น 1', '2027-02-02', 0,      8000, 0,      true),
  ('veh-c', 'C', '4ฒฆ-8053', 'Toyota Hilux Revo Standard Cab + ตู้ทึบ', 'พาณิชย์', 'เทเวศ',               'ชั้น 1', '2027-01-22', 0,      8000, 0,      true),
  ('veh-d', 'D', '4ฒฌ-2419', 'Toyota Hilux Revo Standard Cab + ตู้ทึบ', 'พาณิชย์', 'ไอโออิ',              'ชั้น 1', '2027-01-22', 0,      8000, 0,      true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE vehicles IS '423 Phase A — รถในฟลีต (A B C D) + ประกัน/พ.ร.บ./ภาษี/ตรวจสภาพ + PM ตามระยะไมล์';
COMMENT ON TABLE odometer_logs IS '423 Phase A — บันทึกเลขไมล์ (ถ่ายรูปหน้าปัดตอนออกงาน)';
COMMENT ON TABLE maintenance_records IS '423 Phase A — ประวัติงานซ่อม/บำรุง (ผูก Expense ได้)';
