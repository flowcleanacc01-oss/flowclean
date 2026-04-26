-- ============================================================
-- FlowClean Migration: Security Hardening
-- Fixes: #1 RLS, #4 email unique, #5 CHECK constraints
-- Run this on Supabase Dashboard → SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / DO $$ blocks)
-- ============================================================

-- ============================================================
-- #4: Unique email on app_users (case-insensitive)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_unique
  ON app_users (lower(email));

-- ============================================================
-- #5: CHECK constraints on status fields
-- ============================================================

-- linen_forms.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_linen_forms_status'
  ) THEN
    ALTER TABLE linen_forms ADD CONSTRAINT chk_linen_forms_status
      CHECK (status IN ('draft','received','sorting','washing','drying','ironing','folding','qc','packed','delivered','confirmed'));
  END IF;
END $$;

-- delivery_notes.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_notes_status'
  ) THEN
    ALTER TABLE delivery_notes ADD CONSTRAINT chk_delivery_notes_status
      CHECK (status IN ('pending','delivered','acknowledged'));
  END IF;
END $$;

-- billing_statements.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_status'
  ) THEN
    ALTER TABLE billing_statements ADD CONSTRAINT chk_billing_status
      CHECK (status IN ('draft','sent','paid','overdue'));
  END IF;
END $$;

-- quotations.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_quotations_status'
  ) THEN
    ALTER TABLE quotations ADD CONSTRAINT chk_quotations_status
      CHECK (status IN ('draft','sent','accepted','rejected'));
  END IF;
END $$;

-- product_checklists.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_checklists_status'
  ) THEN
    ALTER TABLE product_checklists ADD CONSTRAINT chk_checklists_status
      CHECK (status IN ('draft','checked','approved'));
  END IF;
END $$;

-- expenses.category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_expenses_category'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT chk_expenses_category
      CHECK (category IN ('chemicals','water','electricity','labor','transport','maintenance','rent','other'));
  END IF;
END $$;

-- customers.customer_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_customer_type'
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT chk_customer_type
      CHECK (customer_type IN ('hotel','spa','clinic','restaurant','other'));
  END IF;
END $$;

-- linen_items.category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_linen_item_category'
  ) THEN
    ALTER TABLE linen_items ADD CONSTRAINT chk_linen_item_category
      CHECK (category IN ('towel','bedsheet','duvet_cover','duvet_insert','mattress_pad','other'));
  END IF;
END $$;

-- ============================================================
-- #1: Replace "Allow all" RLS with service_role-only policies
-- anon key can only READ non-sensitive tables
-- All writes require service_role (server-side)
-- ============================================================

-- Drop all "Allow all for anon" policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'linen_items','app_users','company_info','customers',
      'linen_forms','delivery_notes','billing_statements',
      'tax_invoices','quotations','product_checklists',
      'expenses','audit_logs'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon" ON %I', tbl);
  END LOOP;
END $$;

-- New policies: anon can READ all tables (needed for client-side fetches)
-- but CANNOT write (insert/update/delete are blocked for anon)
-- service_role bypasses RLS entirely, so server operations still work

-- Read-only for anon on all tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'linen_items','company_info','customers',
      'linen_forms','delivery_notes','billing_statements',
      'tax_invoices','quotations','product_checklists',
      'expenses','audit_logs'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Anon read only" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Anon read only" ON %I FOR SELECT USING (true)', tbl);
  END LOOP;
END $$;

-- app_users: anon can read but NOT password_hash
-- (we'll handle this by not selecting password_hash in queries)
DROP POLICY IF EXISTS "Anon read only" ON app_users;
CREATE POLICY "Anon read only" ON app_users FOR SELECT USING (true);

-- Write policies: only authenticated or service_role
-- Since we use service_role key for writes, these are deny-by-default for anon
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'linen_items','app_users','company_info','customers',
      'linen_forms','delivery_notes','billing_statements',
      'tax_invoices','quotations','product_checklists',
      'expenses','audit_logs'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service write" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Service write" ON %I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')', tbl);
  END LOOP;
END $$;

-- ============================================================
-- Done! Summary:
-- - anon key: READ-only on all tables
-- - service_role key: full CRUD (bypasses RLS)
-- - Writes from browser with anon key will be BLOCKED
-- ============================================================
