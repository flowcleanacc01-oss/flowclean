-- Migration: Tax Group fields for department-based billing
-- ลูกค้าที่เป็นแผนกย่อยของบริษัทเดียวกัน สามารถออก IV ในชื่อบริษัทเดียวกันได้
-- Date: 2026-03-20

ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_group_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_group_tax_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_group_address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_group_branch TEXT;
