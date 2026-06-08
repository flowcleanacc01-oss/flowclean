-- 423 Phase B2 — Dispatch Board (ใบงานรอบประจำวัน / Daily Trip)
-- 1 ใบงาน = 1 รอบ × 1 วัน (ตรงกับใบจดมือคนขับ) — ผูกรถ/คนขับ/เด็กรถ + จุดลูกค้า (stops jsonb)
-- id = deterministic 'dt_{date}_{roundId}' → generate idempotent (กันซ้ำ ตามบทเรียน 409/410)
-- writes ผ่าน service_role · reads ผ่าน anon (RLS แบบ rounds/crew 045)

CREATE TABLE IF NOT EXISTS daily_trips (
  id TEXT PRIMARY KEY,                       -- dt_2026-06-08_round-v
  date TEXT NOT NULL DEFAULT '',             -- ISO yyyy-mm-dd
  round_id TEXT NOT NULL DEFAULT '',
  vehicle_id TEXT NOT NULL DEFAULT '',       -- override รถประจำรอบ ('' = ใช้ default ของรอบ)
  driver_id TEXT NOT NULL DEFAULT '',        -- override คนขับ (backup pool swap ที่นี่)
  helper_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',    -- 'planned' | 'running' | 'done'
  note TEXT NOT NULL DEFAULT '',
  stops JSONB NOT NULL DEFAULT '[]'::jsonb,  -- TripStop[] (customerId/sequence/source/bagCount/status/...)
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS (anon read · service_role all) — ตามแบบ rounds/crew (045)
ALTER TABLE daily_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_daily_trips" ON daily_trips FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_daily_trips" ON daily_trips FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_daily_trips_date ON daily_trips(date);
CREATE INDEX IF NOT EXISTS idx_daily_trips_round ON daily_trips(round_id);

COMMENT ON TABLE daily_trips IS '423 Phase B2 — ใบงานรอบประจำวัน (Dispatch Board): รอบ×รถ×คน×จุดลูกค้า ต่อวัน';
