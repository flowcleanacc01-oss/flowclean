-- 418 Tier 0 — per-WB tax override (รองรับลูกค้าที่ WB บางใบมีภาษี บางใบไม่มี เช่น J19 วันคี่/คู่)
-- nullable: NULL = ตามค่า default ของลูกค้า (พฤติกรรมเดิม) · 'full' = VAT+WHT · 'none' = ไม่มีภาษี
-- additive + nullable → ปลอดภัย ย้อนกลับได้ (DROP COLUMN) · ไม่ใส่ CHECK กัน 23514 (code คุมค่าเอง)
ALTER TABLE billing_statements ADD COLUMN IF NOT EXISTS tax_override text;
