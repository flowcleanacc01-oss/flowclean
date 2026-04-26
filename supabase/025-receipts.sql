-- Migration: Add receipts table (Feature 148)
-- ใบเสร็จรับเงิน — สำหรับลูกค้าที่ไม่คิด VAT (enableVat=false)
-- ❌ ไม่ใช่ใบกำกับภาษี · ❌ ไม่มี VAT field
-- ✅ 1 WB → 1 RC (เหมือน TaxInvoice แต่ไม่มี vat column)

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL DEFAULT '' UNIQUE,
  billing_statement_id TEXT NOT NULL REFERENCES billing_statements(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  issue_date TEXT NOT NULL DEFAULT '',
  line_items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  grand_total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_printed BOOLEAN NOT NULL DEFAULT false,
  is_exported BOOLEAN NOT NULL DEFAULT false,
  is_paid BOOLEAN NOT NULL DEFAULT false
);

-- RLS policies (anon read-only + service_role writes — ตามแบบเดียวกับ tax_invoices)
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_receipts" ON receipts FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_receipts" ON receipts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Index for billing_statement_id lookup (1:1 link)
CREATE INDEX IF NOT EXISTS idx_receipts_billing_statement_id ON receipts(billing_statement_id);
CREATE INDEX IF NOT EXISTS idx_receipts_customer_id ON receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_issue_date ON receipts(issue_date);
