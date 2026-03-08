-- Migration: Add department checkboxes to linen_forms
-- 4 แผนก: ผ้าเรียบ, ปลอกหมอน, ผ้าขน, สปา
-- checkbox อิสระ — ติ๊กได้โดยไม่ต้องเรียงลำดับ

ALTER TABLE linen_forms ADD COLUMN IF NOT EXISTS dept_drying BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE linen_forms ADD COLUMN IF NOT EXISTS dept_ironing BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE linen_forms ADD COLUMN IF NOT EXISTS dept_folding BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE linen_forms ADD COLUMN IF NOT EXISTS dept_qc BOOLEAN NOT NULL DEFAULT false;

-- Map legacy statuses (drying/ironing/folding/qc) → new statuses
-- drying → washing (ซักอบเสร็จ) + tick deptDrying
UPDATE linen_forms SET status = 'washing', dept_drying = true WHERE status = 'drying';
-- ironing → packed (นับแพคแล้ว) + tick relevant depts
UPDATE linen_forms SET status = 'packed', dept_ironing = true WHERE status = 'ironing';
UPDATE linen_forms SET status = 'packed', dept_folding = true WHERE status = 'folding';
UPDATE linen_forms SET status = 'packed', dept_qc = true WHERE status = 'qc';
