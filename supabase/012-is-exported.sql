-- Migration: add is_exported column to track file-export status (JPG/PDF/CSV)
-- Separate from is_printed (print button only)

ALTER TABLE linen_forms
  ADD COLUMN IF NOT EXISTS is_exported BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS is_exported BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE billing_statements
  ADD COLUMN IF NOT EXISTS is_exported BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tax_invoices
  ADD COLUMN IF NOT EXISTS is_exported BOOLEAN NOT NULL DEFAULT false;
