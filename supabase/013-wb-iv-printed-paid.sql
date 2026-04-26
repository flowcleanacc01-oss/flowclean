-- Migration: add is_printed, is_exported to billing_statements & tax_invoices
--            add is_paid to tax_invoices
-- Date: 2026-03-17
-- Root cause: these columns were missing, causing "บันทึกข้อมูลไม่สำเร็จ" errors

ALTER TABLE billing_statements
  ADD COLUMN IF NOT EXISTS is_printed  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_exported BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tax_invoices
  ADD COLUMN IF NOT EXISTS is_printed  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_exported BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_paid     BOOLEAN NOT NULL DEFAULT false;
