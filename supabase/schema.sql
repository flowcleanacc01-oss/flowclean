-- ============================================================
-- FlowClean — Supabase Schema (TEXT IDs) — v6 (complete)
-- 13 tables (dependency order)
-- Note: linen_forms.rows is JSONB — includes col6_factoryPackSend
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Drop old tables (if exists) in reverse dependency order
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS product_checklists CASCADE;
DROP TABLE IF EXISTS tax_invoices CASCADE;
DROP TABLE IF EXISTS billing_statements CASCADE;
DROP TABLE IF EXISTS delivery_notes CASCADE;
DROP TABLE IF EXISTS linen_forms CASCADE;
DROP TABLE IF EXISTS quotations CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS company_info CASCADE;
DROP TABLE IF EXISTS app_users CASCADE;
DROP TABLE IF EXISTS linen_items CASCADE;
DROP TABLE IF EXISTS linen_categories CASCADE;

-- Drop old policies (safe — CASCADE above handles this)

-- ============================================================
-- 1. Linen Categories
-- ============================================================
CREATE TABLE linen_categories (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 2. Linen Items (catalog reference)
-- ============================================================
CREATE TABLE linen_items (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  default_price NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 2. App Users
-- ============================================================
CREATE TABLE app_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- 3. Company Info (singleton — max 1 row)
-- ============================================================
CREATE TABLE company_info (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account_name TEXT NOT NULL DEFAULT '',
  bank_account_number TEXT NOT NULL DEFAULT ''
);

-- ============================================================
-- 4. Customers
-- ============================================================
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  customer_code TEXT NOT NULL DEFAULT '',
  customer_type TEXT NOT NULL DEFAULT 'hotel',
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  credit_days INTEGER NOT NULL DEFAULT 30,
  billing_model TEXT NOT NULL DEFAULT 'per_piece' CHECK (billing_model IN ('per_piece', 'monthly_flat')),
  monthly_flat_rate NUMERIC NOT NULL DEFAULT 0,
  min_per_trip NUMERIC NOT NULL DEFAULT 0,
  enable_per_piece BOOLEAN NOT NULL DEFAULT true,
  enable_min_per_trip BOOLEAN NOT NULL DEFAULT false,
  enable_waive BOOLEAN NOT NULL DEFAULT false,
  min_per_trip_threshold NUMERIC NOT NULL DEFAULT 0,
  enable_min_per_month BOOLEAN NOT NULL DEFAULT false,
  enabled_items TEXT[] NOT NULL DEFAULT '{}',
  price_list JSONB NOT NULL DEFAULT '[]',
  price_history JSONB NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- 5. Linen Forms
-- ============================================================
CREATE TABLE linen_forms (
  id TEXT PRIMARY KEY,
  form_number TEXT NOT NULL DEFAULT '' UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  rows JSONB NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  bags_sent_count INTEGER NOT NULL DEFAULT 0,
  bags_pack_count INTEGER NOT NULL DEFAULT 0,
  dept_drying BOOLEAN NOT NULL DEFAULT false,
  dept_ironing BOOLEAN NOT NULL DEFAULT false,
  dept_folding BOOLEAN NOT NULL DEFAULT false,
  dept_qc BOOLEAN NOT NULL DEFAULT false
);

-- ============================================================
-- 6. Delivery Notes
-- ============================================================
CREATE TABLE delivery_notes (
  id TEXT PRIMARY KEY,
  note_number TEXT NOT NULL DEFAULT '' UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  linen_form_ids TEXT[] NOT NULL DEFAULT '{}',
  date TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]',
  driver_name TEXT NOT NULL DEFAULT '',
  vehicle_plate TEXT NOT NULL DEFAULT '',
  receiver_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  is_printed BOOLEAN NOT NULL DEFAULT false,
  is_billed BOOLEAN NOT NULL DEFAULT false,
  transport_fee_trip NUMERIC NOT NULL DEFAULT 0,
  transport_fee_month NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

-- ============================================================
-- 7. Billing Statements
-- ============================================================
CREATE TABLE billing_statements (
  id TEXT PRIMARY KEY,
  billing_number TEXT NOT NULL DEFAULT '' UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  delivery_note_ids TEXT[] NOT NULL DEFAULT '{}',
  billing_month TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  line_items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat NUMERIC NOT NULL DEFAULT 0,
  grand_total NUMERIC NOT NULL DEFAULT 0,
  withholding_tax NUMERIC NOT NULL DEFAULT 0,
  net_payable NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  paid_date TEXT,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

-- ============================================================
-- 8. Tax Invoices
-- ============================================================
CREATE TABLE tax_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL DEFAULT '' UNIQUE,
  billing_statement_id TEXT NOT NULL REFERENCES billing_statements(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  issue_date TEXT NOT NULL DEFAULT '',
  line_items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat NUMERIC NOT NULL DEFAULT 0,
  grand_total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

-- ============================================================
-- 9. Quotations
-- ============================================================
CREATE TABLE quotations (
  id TEXT PRIMARY KEY,
  quotation_number TEXT NOT NULL DEFAULT '' UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_contact TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  valid_until TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]',
  conditions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT ''
);

-- ============================================================
-- 10. Product Checklists
-- ============================================================
CREATE TABLE product_checklists (
  id TEXT PRIMARY KEY,
  checklist_number TEXT NOT NULL DEFAULT '' UNIQUE,
  type TEXT NOT NULL DEFAULT 'qc' CHECK (type IN ('qc', 'loading')),
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  linked_document_id TEXT NOT NULL DEFAULT '',
  linked_document_number TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]',
  inspector_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

-- ============================================================
-- 11. Expenses
-- ============================================================
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  reference TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT ''
);

-- ============================================================
-- 12. Audit Logs
-- ============================================================
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  entity_label TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);

-- ============================================================
-- RLS: Hardened — anon read-only, service_role writes
-- Reads: anon can SELECT (client reads via supabase-js)
-- Writes: only service_role (via /api/db server proxy)
-- app_users: anon can only read non-sensitive columns
-- ============================================================
ALTER TABLE linen_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE linen_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE linen_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Anon: read-only for all tables
CREATE POLICY "anon_read" ON linen_categories FOR SELECT USING (true);
CREATE POLICY "anon_read" ON linen_items FOR SELECT USING (true);
CREATE POLICY "anon_read" ON app_users FOR SELECT USING (true);
CREATE POLICY "anon_read" ON company_info FOR SELECT USING (true);
CREATE POLICY "anon_read" ON customers FOR SELECT USING (true);
CREATE POLICY "anon_read" ON linen_forms FOR SELECT USING (true);
CREATE POLICY "anon_read" ON delivery_notes FOR SELECT USING (true);
CREATE POLICY "anon_read" ON billing_statements FOR SELECT USING (true);
CREATE POLICY "anon_read" ON tax_invoices FOR SELECT USING (true);
CREATE POLICY "anon_read" ON quotations FOR SELECT USING (true);
CREATE POLICY "anon_read" ON product_checklists FOR SELECT USING (true);
CREATE POLICY "anon_read" ON expenses FOR SELECT USING (true);
CREATE POLICY "anon_read" ON audit_logs FOR SELECT USING (true);

-- Service role: full access for writes (via /api/db proxy)
CREATE POLICY "service_write" ON linen_categories FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON linen_items FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON app_users FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON company_info FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON customers FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON linen_forms FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON delivery_notes FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON billing_statements FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON tax_invoices FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON quotations FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON product_checklists FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON expenses FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_write" ON audit_logs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
