-- 432.1 — Saved Places (จุดที่บันทึกที่ "ไม่ใช่ลูกค้า"): ร้านอาหาร/ปั๊ม/จุดพัก/ธุระส่วนตัว
-- จับคู่จุดจอด GPS ที่ไม่ตรงลูกค้า → อ่านพฤติกรรมคนขับง่ายขึ้น
--   (เช่น "จากโรงแรม V → ร้านก๋วยเตี๋ยวไก่ แวะ 20 นาที")
-- category = food/rest/personal → "แวะส่วนตัว" ไฮไลต์เตือน · fuel/other = ปกติ
-- writes ผ่าน service_role (/api/db) · reads ผ่าน anon (RLS) — ตามแบบ fuel_logs (047)

CREATE TABLE IF NOT EXISTS saved_places (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'other',  -- food | rest | personal | fuel | other
  lat         NUMERIC NOT NULL DEFAULT 0,
  lng         NUMERIC NOT NULL DEFAULT 0,
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saved_places ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_saved_places" ON saved_places FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_saved_places" ON saved_places FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE saved_places IS '432.1 — จุดที่บันทึก (ไม่ใช่ลูกค้า) สำหรับจับคู่จุดจอด GPS + อ่านพฤติกรรมคนขับ';
