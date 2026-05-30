-- 397 — QT accepted-scan: เก็บไฟล์สแกนใบเสนอราคาที่ลูกค้าเซ็นตอบรับ (.jpg/.png/.pdf)
--   ไฟล์เก็บที่ Supabase Storage (private bucket) · DB เก็บแค่ path → ไม่หน่วง query ปกติ

-- columns (เก็บ path + เวลาอัพโหลด)
alter table quotations add column if not exists accepted_scan_path text;
alter table quotations add column if not exists accepted_scan_uploaded_at timestamptz;

-- private storage bucket (limit 10MB · เฉพาะ jpg/png/pdf)
--   หมายเหตุ: ถ้า insert ผ่าน SQL ไม่ได้ (สิทธิ์ storage) → API route /api/qt-scan สร้าง bucket ให้อัตโนมัติ (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qt-accepted-scans', 'qt-accepted-scans', false, 10485760,
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- ไม่ตั้ง RLS policy ให้ anon: เข้าถึงทุกอย่างผ่าน service_role (API route) + signed URL เท่านั้น (ลายเซ็นลูกค้า = sensitive)
