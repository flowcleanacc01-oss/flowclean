-- ============================================================
-- FlowClean Migration: Auth + Audit Log
-- Run this on Supabase Dashboard → SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS)
-- ============================================================

-- 1. Add password_hash to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';

-- 2. Set default passwords for existing users
-- Admin (flowcleanwash@gmail.com): flowclean2026
UPDATE app_users SET password_hash = '$2b$10$DRKyFc.v2JhxskVNf5eaaehJPof8oyD.xmcqjbLIOkAljhEdeaI9a'
WHERE email = 'flowcleanwash@gmail.com' AND password_hash = '';

-- Staff: staff1234
UPDATE app_users SET password_hash = '$2b$10$I5Uieknqc20uLCkJ0fYd..mCifIRPpMeZPeqpd6fM8UodwbWIx6eC'
WHERE role = 'staff' AND password_hash = '';

-- 3. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id);

-- 4. RLS for audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Allow all for anon') THEN
    CREATE POLICY "Allow all for anon" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
