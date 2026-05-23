-- 347 — Replace X-prefix regex with user-toggle field
--
-- เดิม (338): protected-codes.ts ใช้ regex /^X\d/ hardcode → ผูก convention ของระบบ
--             กับ pattern ของผู้ใช้คนเดียว → "ดูแปลกๆ" (per ติ๊ด feedback)
--
-- ใหม่ (347): admin lock/unlock toggle per linen_item
--   - is_protected = TRUE → block merge / warn ที่ tool ต่างๆ
--   - protected_reason / protected_by / protected_at = audit
--   - admin คนอื่นเห็นว่า "อันนี้อย่าไปแตะ" + อ่านเหตุผล
--   - admin ที่ต้องการแก้จริงๆ → unlock ก่อน

ALTER TABLE linen_items
  ADD COLUMN IF NOT EXISTS is_protected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS protected_reason TEXT,
  ADD COLUMN IF NOT EXISTS protected_by TEXT,
  ADD COLUMN IF NOT EXISTS protected_at TIMESTAMPTZ;
