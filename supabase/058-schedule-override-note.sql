-- 455 — เพิ่ม override type 'note' (หมายเหตุรายวันต่อ chip ในปฏิทินขนส่ง)
--   'note' = annotation เฉพาะ (customer, date) · ไม่กระทบ schedule (logic skip/extra/reschedule ทุกตัว ignore)
--   reuse schedule_overrides.reason เก็บข้อความ · override ทับ customer.dispatch_note เฉพาะวันนั้น
--
-- migration 035 สร้าง inline CHECK (type IN ('skip','extra','reschedule_skip','reschedule_add'))
-- → addScheduleOverride({type:'note'}) จะโดน 23514 reject ถ้าไม่ relax constraint ก่อน (additive · ข้อมูลเดิมผ่านอยู่แล้ว)

ALTER TABLE schedule_overrides DROP CONSTRAINT IF EXISTS schedule_overrides_type_check;

ALTER TABLE schedule_overrides ADD CONSTRAINT schedule_overrides_type_check
  CHECK (type IN ('skip', 'extra', 'reschedule_skip', 'reschedule_add', 'note'));
