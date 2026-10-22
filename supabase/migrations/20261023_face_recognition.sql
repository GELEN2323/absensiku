-- ============================================================
-- 20261023_face_recognition.sql
-- Face recognition + liveness untuk aplikasi absensi.
--
-- Jalankan di Supabase SQL Editor (DDL tidak bisa lewat PostgREST).
-- Aman dijalankan berulang (IF NOT EXISTS / IF EXISTS).
--
-- Catatan penting:
-- * employees.face_encoding SUDAH ADA dan dipakai server lama.
--   Kolom itu TIDAK dihapus di sini (biar rollback aman), tapi setelah
--   migrasi ini sumber kebenaran wajah adalah employee_faces.
-- * Index ivfflat TIDAK dibuat. Dengan <100 baris, ivfflat lists=50
--   bisa MELEWATKAN duplikat (recall rendah) — padahal cek duplikat
--   adalah kontrol keamanan. Exact scan benar dan cepat di skala ini.
--   Index HNSW disediakan (commented) untuk saat data > ~1.000.
-- ============================================================

create extension if not exists vector;

-- ------------------------------------------------------------
-- 1. Tabel wajah (1 karyawan = 1 embedding 128-d)
-- ------------------------------------------------------------
create table if not exists employee_faces (
  employee_id   uuid primary key references employees(id) on delete cascade,
  embedding     vector(128) not null,
  registered_at timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Metric yang dipakai adalah EUCLIDEAN, bukan cosine.
-- Pengukuran pada descriptor face-api 128-d menunjukkan cosine TIDAK
-- diskriminatif (beda orang = 0.06-0.18), sedangkan euclidean
-- beda orang = 0.52-0.89. Jadi index (kalau nanti dipakai) harus L2.
-- create index if not exists employee_faces_embedding_idx
--   on employee_faces using hnsw (embedding vector_l2_ops);

-- ------------------------------------------------------------
-- 2. Kolom absensi
-- ------------------------------------------------------------
alter table attendance
  add column if not exists face_match float,
  add column if not exists face_verified boolean not null default false,
  add column if not exists liveness_passed boolean not null default false,
  add column if not exists needs_photo boolean not null default false,
  add column if not exists face_verification_id uuid;

-- ------------------------------------------------------------
-- 3. Status registrasi wajah
-- ------------------------------------------------------------
alter table employees
  add column if not exists face_registered boolean not null default false;

-- Sinkronkan flag dengan sumber kebenaran baru (employee_faces).
-- JANGAN backfill dari employees.face_encoding: isinya embedding lama
-- (512-d / format lain) yang tidak dipakai pipeline baru. Kalau
-- di-backfill, user akan dianggap terdaftar padahal verify selalu gagal.
update employees e
   set face_registered = exists (
     select 1 from employee_faces f where f.employee_id = e.id
   );
-- Catatan: employees.face_encoding dibiarkan (legacy) tapi tidak dibaca lagi
-- oleh kode baru. Boleh di-drop manual setelah yakin tidak ada yang butuh.

-- ------------------------------------------------------------
-- 4. Anti absen dobel
-- ------------------------------------------------------------
-- Cek duplikat dulu (kalau ada, index akan gagal dibuat).
-- Query ini harus mengembalikan 0 baris:
--   select employee_id, tanggal, count(*)
--     from attendance
--    where check_in_at is not null
--    group by 1, 2 having count(*) > 1;
create unique index if not exists attendance_emp_tanggal
  on attendance (employee_id, tanggal)
  where check_in_at is not null;

-- ------------------------------------------------------------
-- 5. Log percobaan (enroll/verify/liveness)
-- ------------------------------------------------------------
create table if not exists face_attempt_logs (
  id           bigint generated always as identity primary key,
  employee_id  uuid references employees(id) on delete set null,
  attempt_type text not null check (attempt_type in ('enroll','verify','liveness')),
  success      boolean not null,
  distance     float,
  reason       text,
  ip           text,
  created_at   timestamptz not null default now()
);

create index if not exists face_attempt_logs_employee_idx
  on face_attempt_logs (employee_id, created_at desc);

-- ------------------------------------------------------------
-- 6. Bukti verifikasi sekali pakai (pengganti boolean dari client)
-- ------------------------------------------------------------
-- /api/face/verify menulis baris di sini. Endpoint attendance hanya
-- menerima verification_id, lalu membaca distance dari baris ini.
-- Tidak ada policy = hanya service role yang bisa akses.
create table if not exists face_verifications (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  distance        float not null,
  liveness_passed boolean not null default false,
  expires_at      timestamptz not null default now() + interval '2 minutes',
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists face_verifications_employee_idx
  on face_verifications (employee_id, created_at desc);

-- ------------------------------------------------------------
-- 7. RPC: cari wajah terdekat (exact scan)
-- ------------------------------------------------------------
-- query dikirim sebagai string '[0.1,0.2,...]' agar aman lewat PostgREST.
-- Operator <-> = euclidean distance (bukan cosine <=>).
create or replace function match_employee_face(
  query vector(128),
  max_distance float default 0.35
)
returns table (employee_id uuid, dist float)
language sql
stable
as $$
  select ef.employee_id,
         (ef.embedding <-> query)::float as dist
    from employee_faces ef
   where ef.embedding <-> query < max_distance
   order by ef.embedding <-> query asc
   limit 1;
$$;

revoke all on function match_employee_face(vector, float) from public;
revoke all on function match_employee_face(vector, float) from anon, authenticated;
grant execute on function match_employee_face(vector, float) to service_role;

-- ------------------------------------------------------------
-- 8. RLS: hanya service role
-- ------------------------------------------------------------
alter table employee_faces     enable row level security;
alter table face_attempt_logs  enable row level security;
alter table face_verifications enable row level security;

-- Tidak ada policy sengaja. Verifikasi setelah migrasi:
--   select tablename, policyname from pg_policies
--    where tablename in ('employee_faces','face_attempt_logs','face_verifications');
-- Hasil yang benar: 0 baris policy.

-- ------------------------------------------------------------
-- 9. Verifikasi cepat (jalankan manual)
-- ------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
--  where table_name = 'attendance' and column_name like 'face%';
-- select indexname from pg_indexes where tablename = 'attendance';
