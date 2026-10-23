-- ============================================================
-- 20261023_base_schema.sql
-- Skema dasar absensi (fresh DB) — bentuk tabel HARUS sama dengan
-- kolom yang dipakai server di server/src (auth.js, routes/attendance.js,
-- routes/admin.js, routes/face.js, photos.js).
--
-- Urutan: jalankan file ini SEBELUM 20261023_face_recognition.sql
-- (nama file sudah urut alfabetis untuk `supabase db push`).
--
-- Aman dijalankan berulang: create table/column/index IF NOT EXISTS.
--
-- Catatan: pakai cast untuk tanggal, bukan trunc(now()). trunc() hanya
-- menerima angka/numeric — untuk timestamp ada date_trunc(), dan untuk
-- kolom date cukup `(now() at time zone 'Asia/Jakarta')::date`.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ------------------------------------------------------------
-- 0. Bersihkan sisa tabel yang dibuat skrip lain dengan bentuk salah
--    (mis. employees.name / profiles.full_name dari script "Fresh DB" lain)
--    dan MASIH KOSONG. Tabel yang sudah berisi data tidak disentuh.
-- ------------------------------------------------------------
-- Catatan: pengecekan isi tabel memakai EXECUTE karena PL/pgSQL mem-plan
-- query statis saat blok dijalankan — `select ... from public.employees`
-- akan error 42P01 kalau tabelnya memang belum ada.
do $$
declare
  is_empty boolean;
begin
  if to_regclass('public.employees') is not null
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'employees' and column_name = 'name'
     ) then
    execute 'select not exists (select 1 from public.employees)' into is_empty;
    if is_empty then
      drop table if exists public.attendance cascade;
      drop table if exists public.profiles cascade;
      drop table if exists public.employees cascade;
    end if;
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. employees
-- Dipakai: login (nip -> email), registrasi (nip, nama, departemen,
-- email), admin (daftar karyawan), face (face_registered).
-- ------------------------------------------------------------
create table if not exists employees (
  id            uuid primary key default gen_random_uuid(),
  nip           text,
  nama          text,
  departemen    text,
  email         text,
  photo_url     text,
  face_registered boolean not null default false,
  face_encoding bytea, -- legacy, tidak dibaca kode baru
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Kalau tabelnya sudah terlanjur dibuat dengan kolom lain (mis. name/role),
-- kolom yang dipakai server ditambahkan di sini.
alter table employees
  add column if not exists nip text,
  add column if not exists nama text,
  add column if not exists departemen text,
  add column if not exists email text,
  add column if not exists photo_url text,
  add column if not exists face_registered boolean not null default false,
  add column if not exists face_encoding bytea,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Registrasi mencari NIP/email dengan ilike (case-insensitive), jadi
-- keunikannya dijaga pada lower(). Kalau index ini gagal dibuat, berarti
-- sudah ada NIP/email duplikat — bersihkan dulu datanya.
create unique index if not exists employees_nip_lower_idx
  on employees (lower(nip)) where nip is not null;
create unique index if not exists employees_email_lower_idx
  on employees (lower(email)) where email is not null;

-- ------------------------------------------------------------
-- 2. profiles (1 baris per auth.user)
-- Dipakai: requireAuth (role, employee_id, nama, email).
-- ------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  nama        text,
  role        text not null default 'karyawan' check (role in ('admin', 'karyawan')),
  employee_id uuid references employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table profiles
  add column if not exists email text,
  add column if not exists nama text,
  add column if not exists role text not null default 'karyawan',
  add column if not exists employee_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_email_lower_idx
  on profiles (lower(email)) where email is not null;
create index if not exists profiles_employee_idx on profiles (employee_id);

-- ------------------------------------------------------------
-- 3. attendance
-- Default tanggal = tanggal WIB (bukan trunc(now()) — trunc() hanya
-- untuk angka, date_trunc() untuk timestamp; untuk date pakai cast).
-- Server selalu mengirim tanggal eksplisit; default ini hanya pengaman.
-- ------------------------------------------------------------
create table if not exists attendance (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid references employees(id) on delete set null,
  tanggal               date not null default ((now() at time zone 'Asia/Jakarta')::date),
  hari                  text,
  check_in_at           timestamptz,
  check_in_lat          double precision,
  check_in_long         double precision,
  check_in_address      text,
  check_out_at          timestamptz,
  check_out_lat         double precision,
  check_out_long        double precision,
  check_out_address     text,
  lokasi_tidak_tersedia boolean not null default false,
  work_duration         text,
  face_match            float,
  face_verified         boolean not null default false,
  liveness_passed       boolean not null default false,
  needs_photo           boolean not null default false,
  face_verification_id  uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table attendance
  add column if not exists hari text,
  add column if not exists check_in_at timestamptz,
  add column if not exists check_in_lat double precision,
  add column if not exists check_in_long double precision,
  add column if not exists check_in_address text,
  add column if not exists check_out_at timestamptz,
  add column if not exists check_out_lat double precision,
  add column if not exists check_out_long double precision,
  add column if not exists check_out_address text,
  add column if not exists lokasi_tidak_tersedia boolean not null default false,
  add column if not exists work_duration text,
  add column if not exists face_match float,
  add column if not exists face_verified boolean not null default false,
  add column if not exists liveness_passed boolean not null default false,
  add column if not exists needs_photo boolean not null default false,
  add column if not exists face_verification_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists attendance_employee_idx
  on attendance (employee_id, tanggal desc);
create index if not exists attendance_tanggal_idx
  on attendance (tanggal desc);

-- Anti absen dobel per karyawan per tanggal.
create unique index if not exists attendance_emp_tanggal
  on attendance (employee_id, tanggal)
  where check_in_at is not null;

-- ------------------------------------------------------------
-- 4. RLS
-- Client tidak pernah menyentuh Supabase langsung (semua lewat API),
-- jadi cukup aktifkan RLS TANPA policy: anon/authenticated tertutup,
-- service_role tetap bisa (bypass RLS).
-- ------------------------------------------------------------
alter table employees  enable row level security;
alter table profiles   enable row level security;
alter table attendance enable row level security;

-- ------------------------------------------------------------
-- 5. Bucket foto absensi (server/src/photos.js)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('employee-photos', 'employee-photos', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 6. Verifikasi cepat (jalankan manual)
-- ------------------------------------------------------------
-- select column_name from information_schema.columns
--  where table_name = 'attendance' order by ordinal_position;
