-- Migration: Drop CHECK constraint on linen_items.category
-- หมวดผ้าเป็น dynamic (เพิ่ม/ลบได้จาก UI) ไม่ควรมี hardcoded CHECK
-- Date: 2026-03-21

ALTER TABLE linen_items DROP CONSTRAINT IF EXISTS chk_linen_item_category;
