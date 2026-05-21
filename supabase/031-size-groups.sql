-- 317 Phase 1 — Size Groups (รวมไซส์)
--
-- Concept: บางรายการ (ผ้าใหญ่/สีต่าง) นับรวมไซส์ตอนเข้า (col5) แต่แยกตอนแพคส่ง (col6)
-- เช่น ผ้าปูเตียง BD35 + BD50 + BD60 → group "BEDSHEET"
--
-- linen_items.size_group: catalog-level mapping (เป็น default suggestion)
--   - NULL = นับแยกไซส์ตามปกติ
--   - "BEDSHEET" = อยู่ใน group นี้ (ใช้ free-form text)
--
-- customers.aggregate_size_groups: per-customer opt-in
--   - jsonb array of { groupKey: string, col2Mode: 'aggregate' | 'per_row' }
--   - groupKey ต้องตรงกับ linen_items.size_group
--   - col2Mode: 'aggregate' = ลูกค้าส่งรวม (col2 ที่ group level)
--             'per_row' = ลูกค้าส่งแยกไซส์ (col2 ตามเดิม)
--   - default = [] (ไม่ opt-in — ทำงานเดิม)
--
-- linen_forms.group_inputs: Phase 2 (ยังไม่ใช้ใน Phase 1)
--   - jsonb { [groupKey]: { col5?: number, col2?: number, col3?: number } }
--   - Phase 1: read-only views ใช้ row-level sum

ALTER TABLE linen_items
  ADD COLUMN IF NOT EXISTS size_group TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS aggregate_size_groups JSONB DEFAULT '[]'::jsonb;

ALTER TABLE linen_forms
  ADD COLUMN IF NOT EXISTS group_inputs JSONB DEFAULT '{}'::jsonb;
