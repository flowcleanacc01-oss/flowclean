-- 449 — Milk-Run Analytics (Phase 1): reconstruct GPS history เป็น visit/leg (materialize)
--   trip = leg (เคลื่อนที่ A→B) · ช่วงดับเครื่องจอด = dwell ที่ลูกค้า
--   สะสมรายวัน idempotent ต่อ (vehicle_id, date) — backfill ลบของวัน-คันนั้นแล้ว insert ใหม่
--   writes ผ่าน service_role (/api/db) · reads ผ่าน anon (RLS) — ตามแบบ saved_places (053)

-- การจอดที่ลูกค้า 1 ครั้ง
CREATE TABLE IF NOT EXISTS gps_visits (
  id           TEXT PRIMARY KEY,                 -- vmt_{date}_{vehicleId}_{seq}
  date         TEXT NOT NULL DEFAULT '',         -- yyyy-mm-dd (วันไทย)
  vehicle_id   TEXT NOT NULL DEFAULT '',
  driver_id    TEXT NOT NULL DEFAULT '',
  round_id     TEXT NOT NULL DEFAULT '',
  customer_id  TEXT NOT NULL DEFAULT '',
  arrive_time  TEXT NOT NULL DEFAULT '',         -- "yyyy-mm-dd HH:MM:SS" (เวลาไทย)
  depart_time  TEXT NOT NULL DEFAULT '',         -- '' = ไม่ทราบ (จุดสุดท้ายของวัน)
  dwell_min    INTEGER NOT NULL DEFAULT 0,
  confidence   TEXT NOT NULL DEFAULT 'high',     -- high | low
  sequence     INTEGER NOT NULL DEFAULT 0
);

-- การเคลื่อนที่ 1 เที่ยว (leg)
CREATE TABLE IF NOT EXISTS gps_legs (
  id               TEXT PRIMARY KEY,             -- lgt_{date}_{vehicleId}_{seq}
  date             TEXT NOT NULL DEFAULT '',
  vehicle_id       TEXT NOT NULL DEFAULT '',
  driver_id        TEXT NOT NULL DEFAULT '',
  round_id         TEXT NOT NULL DEFAULT '',
  from_key         TEXT NOT NULL DEFAULT 'unknown',  -- factory | c:<id> | s:<id> | unknown
  from_customer_id TEXT NOT NULL DEFAULT '',
  from_name        TEXT NOT NULL DEFAULT '',
  to_key           TEXT NOT NULL DEFAULT 'unknown',
  to_customer_id   TEXT NOT NULL DEFAULT '',
  to_name          TEXT NOT NULL DEFAULT '',
  depart_time      TEXT NOT NULL DEFAULT '',
  arrive_time      TEXT NOT NULL DEFAULT '',
  travel_min       INTEGER NOT NULL DEFAULT 0,
  km               NUMERIC NOT NULL DEFAULT 0,
  fuel_l           NUMERIC NOT NULL DEFAULT 0,
  score            NUMERIC NOT NULL DEFAULT 0
);

-- index สำหรับสถิติ + idempotent backfill
CREATE INDEX IF NOT EXISTS idx_gps_visits_vehicle_date ON gps_visits (vehicle_id, date);
CREATE INDEX IF NOT EXISTS idx_gps_visits_customer ON gps_visits (customer_id);
CREATE INDEX IF NOT EXISTS idx_gps_legs_vehicle_date ON gps_legs (vehicle_id, date);
CREATE INDEX IF NOT EXISTS idx_gps_legs_from_to ON gps_legs (from_customer_id, to_customer_id);

ALTER TABLE gps_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_legs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_gps_visits" ON gps_visits FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_gps_visits" ON gps_visits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_gps_legs" ON gps_legs FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_gps_legs" ON gps_legs FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE gps_visits IS '449 — การจอดที่ลูกค้า reconstruct จาก GPS (เวลาถึง/dwell/ออก)';
COMMENT ON TABLE gps_legs IS '449 — การเคลื่อนที่ A→B reconstruct จาก GPS (เวลาเดินทาง/กม./น้ำมัน)';
