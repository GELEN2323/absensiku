-- ============================================================
-- seed.sql — data awal P1
--
-- Jalankan SETELAH 20261024_p1_backend.sql (SQL Editor Supabase).
-- Aman dijalankan berulang: semua insert memakai id tetap / cek exists.
--
-- Berisi:
--   * 1 kantor (locations) — koordinat sama dengan default server
--   * 7 titik patroli (patrol_checkpoints berurutan)
--   * 3 akun demo: 1 Chief, 1 Danru, 1 Anggota
--
-- Password semua akun demo: Absensi123!
-- WAJIB diganti sebelum dipakai di lapangan (App Admin > reset password).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Titik absen kantor
-- ------------------------------------------------------------
insert into locations (id, nama, lat, lng, radius_meter, alamat)
values (
  '10000000-0000-4000-8000-000000000001',
  'Kantor Pusat',
  -7.988931,
  112.627671,
  150,
  'Kantor Pusat'
)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. Tujuh titik patroli (urutan 1..7)
-- ------------------------------------------------------------
insert into patrol_checkpoints (id, nama, lat, lng, radius_meter, urutan)
values
  ('70000000-0000-4000-8000-000000000001', 'Pos 1 — Gerbang Utama',  -7.988931, 112.627671, 50, 1),
  ('70000000-0000-4000-8000-000000000002', 'Pos 2 — Parkir Barat',   -7.989200, 112.627200, 50, 2),
  ('70000000-0000-4000-8000-000000000003', 'Pos 3 — Lobby',          -7.988500, 112.628000, 50, 3),
  ('70000000-0000-4000-8000-000000000004', 'Pos 4 — Gudang',         -7.989400, 112.628400, 50, 4),
  ('70000000-0000-4000-8000-000000000005', 'Pos 5 — Panel Listrik',  -7.988000, 112.628600, 50, 5),
  ('70000000-0000-4000-8000-000000000006', 'Pos 6 — Kantin',         -7.987700, 112.627400, 50, 6),
  ('70000000-0000-4000-8000-000000000007', 'Pos 7 — Pos Belakang',   -7.989100, 112.626800, 50, 7)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3. Akun demo
-- employees.id = auth.users.id = profiles.id supaya satu identitas
-- dipakai konsisten di RLS, storage path, dan API.
-- Email login: <nik kecil>@absensi.local
-- ------------------------------------------------------------
do $$
declare
  v_password text := 'Absensi123!';
  v_hash     text;
  r          record;
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users tidak ada — lewati seed akun (bukan Supabase?).';
    return;
  end if;

  v_hash := extensions.crypt(v_password, extensions.gen_salt('bf'));

  for r in
    select *
      from (values
        ('11111111-1111-4111-8111-111111111111'::uuid, 'CHIEF001',   'Budi Santoso',  'Chief',   'admin'),
        ('22222222-2222-4222-8222-222222222222'::uuid, 'DANRU001',   'Andi Pratama',  'Danru',   'karyawan'),
        ('33333333-3333-4333-8333-333333333333'::uuid, 'ANGGOTA001', 'Citra Lestari', 'Anggota', 'karyawan')
      ) as t(id, nip, nama, jabatan, role)
  loop
    -- 3a. Data karyawan
    insert into employees (id, nip, nama, departemen, email, jabatan, aktif)
    values (
      r.id,
      r.nip,
      r.nama,
      'Keamanan',
      lower(r.nip) || '@absensi.local',
      r.jabatan,
      true
    )
    on conflict (id) do nothing;

    -- 3b. Auth user (hanya bila belum ada)
    if not exists (select 1 from auth.users where id = r.id) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000',
        r.id,
        'authenticated',
        'authenticated',
        lower(r.nip) || '@absensi.local',
        v_hash,
        now(),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('nama', r.nama, 'jabatan', r.jabatan)
      );
    end if;

    -- 3c. Identitas email (dipakai Supabase Auth untuk login password)
    if not exists (
      select 1 from auth.identities
       where user_id = r.id and provider = 'email'
    ) then
      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(),
        r.id::text,
        r.id,
        jsonb_build_object('sub', r.id::text, 'email', lower(r.nip) || '@absensi.local'),
        'email',
        now(),
        now(),
        now()
      );
    end if;

    -- 3d. Profil aplikasi
    insert into profiles (id, email, nama, role, employee_id)
    values (r.id, lower(r.nip) || '@absensi.local', r.nama, r.role, r.id)
    on conflict (id) do nothing;
  end loop;

  raise notice 'Seed akun demo selesai. Password: %', v_password;
end $$;

-- ------------------------------------------------------------
-- 4. Verifikasi
-- ------------------------------------------------------------
-- select nip, nama, jabatan from employees order by jabatan desc;
-- select nama, urutan from patrol_checkpoints order by urutan;
-- select key, value from settings order by key;
