-- Migration: Legacy Documents Archive (Feature 161)
-- เก็บประวัติเอกสาร WB/IV/SD/QT จากระบบเก่า (NeoSME) สำหรับ search/audit/reference
-- READ-ONLY ไม่กระทบ workflow ปัจจุบัน

CREATE TABLE IF NOT EXISTS legacy_documents (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('WB', 'IV', 'SD', 'QT')),
  doc_number TEXT NOT NULL,                -- เลขที่เอกสารต้นฉบับ (WB650900001, IV651200005)
  doc_date TEXT NOT NULL,                  -- ISO YYYY-MM-DD
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',  -- snapshot จากต้นฉบับ
  customer_code TEXT NOT NULL DEFAULT '',  -- legacy X-prefix
  amount NUMERIC NOT NULL DEFAULT 0,       -- จำนวนเงิน
  net_payable NUMERIC NOT NULL DEFAULT 0,  -- ยอดสุทธิ (WB)
  paid_amount NUMERIC NOT NULL DEFAULT 0,  -- ชำระแล้ว (WB)
  outstanding NUMERIC NOT NULL DEFAULT 0,  -- ค้างชำระ (WB)
  status TEXT NOT NULL DEFAULT '',         -- legacy status (P/LP/B/...)
  due_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL DEFAULT '',
  source_file TEXT NOT NULL DEFAULT ''
);

-- RLS — read-only for everyone, writes only via service_role (import scripts)
ALTER TABLE legacy_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_legacy" ON legacy_documents FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_legacy" ON legacy_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_legacy_kind ON legacy_documents(kind);
CREATE INDEX IF NOT EXISTS idx_legacy_doc_date ON legacy_documents(doc_date);
CREATE INDEX IF NOT EXISTS idx_legacy_customer_id ON legacy_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_legacy_customer_code ON legacy_documents(customer_code);
CREATE INDEX IF NOT EXISTS idx_legacy_doc_number ON legacy_documents(doc_number);
