-- P5.2 — Route Plans (ลำดับวิ่งรับ-ส่งผ้าต่อวัน สำหรับปฏิทินขนส่ง)
--
-- 1 row ต่อวัน · ordered_customer_ids = customerId เรียงตามลำดับที่คนขับวิ่ง
-- upsert by date (unique) — drag reorder = overwrite array
-- extensible: P5.3 หลายคันรถ → เปลี่ยน shape jsonb เป็น { vehicleId: [custIds] } ได้

CREATE TABLE IF NOT EXISTS route_plans (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  ordered_customer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_route_plans_date ON route_plans(date);

COMMENT ON TABLE route_plans IS 'P5.2 — ลำดับวิ่งรับ-ส่งผ้าต่อวัน (ordered_customer_ids = customerId เรียงลำดับ)';
