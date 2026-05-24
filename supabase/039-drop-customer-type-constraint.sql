-- 361-scan — chk_customer_type ล็อค 5 ค่าตายตัว แต่ customer_type = dynamic category
--
-- customers/page.tsx (977-981): <select> map จาก customerCategories (user เพิ่ม/แก้ได้)
--   → customer_type = cat.key (ค่าใดก็ได้) · CustomerType(TS)=string · getCustomerCategoryLabel() resolve
-- DB CHECK เดิม = hotel/spa/clinic/restaurant/other → เพิ่มหมวดใหม่แล้ว assign = 23514 reject
--
-- แก้: DROP constraint — field เป็น dynamic (validation อยู่ระดับ category system ไม่ใช่ hardcoded enum)
--   static CHECK อ้าง content ของอีก table ไม่ได้ → drop คือทางที่ถูก

ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customer_type;
