-- 265 — Workflow Mode + per-customer default carry-over mode
--
-- customers.workflow_mode: 'cross_check' (default) | 'trust_customer'
--   - cross_check: โรงงานนับเข้า ใช้ครบ 6 cols
--   - trust_customer: ไม่นับเข้า ข้าม col4 + col5
--
-- customers.default_carry_over_mode: default mode สำหรับ reports หน้าลูกค้านี้
--   - NULL = auto (trust_customer → 2, cross_check → 1)
--   - 1-4 = explicit override
--
-- linen_forms.workflow_mode: snapshot ตอนสร้าง — ป้องกัน drift เมื่อ customer toggle ภายหลัง

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS workflow_mode TEXT DEFAULT 'cross_check' CHECK (workflow_mode IN ('cross_check', 'trust_customer')),
  ADD COLUMN IF NOT EXISTS default_carry_over_mode SMALLINT CHECK (default_carry_over_mode IS NULL OR default_carry_over_mode BETWEEN 1 AND 4);

ALTER TABLE linen_forms
  ADD COLUMN IF NOT EXISTS workflow_mode TEXT CHECK (workflow_mode IS NULL OR workflow_mode IN ('cross_check', 'trust_customer'));
