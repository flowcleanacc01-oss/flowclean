-- 423 Phase B1 — Rounds + Crew (รอบเดินรถ + คนขับ/เด็กติดรถ)
-- รอบ = เส้นทางประจำ (V/SPA/SZH/AKARA/L7/SWD) · ลูกค้าผูก 1 รอบ (round_id ใน customers)
-- crew = คนขับ/เด็กรถ + สถานะสำรอง · writes ผ่าน service_role · reads ผ่าน anon (RLS แบบ receipts)

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL DEFAULT '',           -- V/SPA/SZH/AKARA/L7/SWD
  name TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',      -- 'HH:MM'
  end_time TEXT NOT NULL DEFAULT '',
  default_vehicle_id TEXT NOT NULL DEFAULT '',
  default_driver_id TEXT NOT NULL DEFAULT '',
  default_helper_id TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,  -- SZH = false (พักชั่วคราว)
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crew (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'driver',      -- 'driver' | 'helper'
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'standby' | 'leave'
  default_vehicle_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- customers: รอบประจำ (1 ลูกค้า 1 รอบ) + ลำดับวิ่ง default + หน้าต่างเวลา
ALTER TABLE customers ADD COLUMN IF NOT EXISTS round_id TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS route_sequence NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pickup_window_start TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pickup_window_end TEXT NOT NULL DEFAULT '';

-- RLS (anon read · service_role all) — ตามแบบ receipts (025)
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_rounds" ON rounds FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_rounds" ON rounds FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_crew" ON crew FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_crew" ON crew FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_customers_round ON customers(round_id);

-- Seed 6 รอบ (เวลาตามที่ติ๊ดยืนยัน) · ON CONFLICT idempotent
INSERT INTO rounds (id, code, name, start_time, end_time, color, sort_order, is_active) VALUES
  ('round-v',     'V',     'รอบ V',                    '04:00', '13:00', '#0ea5e9', 1, true),
  ('round-spa',   'SPA',   'รอบ SPA (กลุ่มสปา กลางวัน)', '08:00', '17:00', '#10b981', 2, true),
  ('round-szh',   'SZH',   'รอบ SZH (พักชั่วคราว)',      '08:00', '17:00', '#94a3b8', 3, false),
  ('round-akara', 'AKARA', 'รอบ AKARA',                '15:30', '01:30', '#f59e0b', 4, true),
  ('round-l7',    'L7',    'รอบ L7',                   '17:30', '03:30', '#8b5cf6', 5, true),
  ('round-swd',   'SWD',   'รอบ SWD (กลุ่มรามบุตรี)',    '19:30', '05:30', '#ec4899', 6, true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE rounds IS '423 Phase B — รอบเดินรถประจำ (V/SPA/SZH/AKARA/L7/SWD)';
COMMENT ON TABLE crew IS '423 Phase B — คนขับ/เด็กติดรถ + สถานะสำรอง (active/standby/leave)';
