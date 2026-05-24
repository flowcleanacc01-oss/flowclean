-- 361-scan — app_users_role_check อนุญาตแค่ admin/staff แต่ระบบมี 5 roles
--
-- permissions.ts: UserRole = operator|driver|staff|accountant|admin (5)
-- USER_ROLE_CONFIG + sidebar guards (canViewSD รวม driver) รองรับครบ
-- แต่ DB CHECK เดิม = admin/staff เท่านั้น → สร้าง user role driver/accountant/operator
--   โดน 23514 reject (เจอจาก scan constraints — bug class เดียวกับ 361)
--
-- แก้: relax ให้ครบ 5 roles (additive · admin/staff เดิมยังผ่าน)

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('operator', 'driver', 'staff', 'accountant', 'admin'));
