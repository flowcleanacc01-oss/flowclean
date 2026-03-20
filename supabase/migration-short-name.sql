-- Migration: Add short_name field to customers
-- ชื่อย่อ (WOV, Bell, SWD) ใช้ในงานประจำวัน LF/SD/ตาราง
-- Date: 2026-03-20

ALTER TABLE customers ADD COLUMN IF NOT EXISTS short_name TEXT NOT NULL DEFAULT '';
