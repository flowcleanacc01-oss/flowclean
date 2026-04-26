-- Migration: VAT/WHT per customer + configurable rates
-- Date: 2026-03-24

-- 1. Add VAT/WHT toggles to customers (default true = existing behavior)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_vat BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS enable_withholding BOOLEAN NOT NULL DEFAULT true;

-- 2. Add configurable rates to company_info
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS vat_rate NUMERIC NOT NULL DEFAULT 7;
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS withholding_rate NUMERIC NOT NULL DEFAULT 3;

-- 3. Drop tax_group columns (no longer needed — replaced by shortName per department)
ALTER TABLE customers DROP COLUMN IF EXISTS tax_group_name;
ALTER TABLE customers DROP COLUMN IF EXISTS tax_group_tax_id;
ALTER TABLE customers DROP COLUMN IF EXISTS tax_group_address;
ALTER TABLE customers DROP COLUMN IF EXISTS tax_group_branch;
