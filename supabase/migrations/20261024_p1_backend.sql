-- ============================================================
-- 20261024_p1_backend.sql — P1: fondasi backend dua aplikasi
-- (App Pengguna: Anggota/Danru  •  App Admin: Chief)
--
-- Sifat migrasi: ADITIF. Skema & API lama (employees/profiles/attendance
-- per-hari, web app + Express) tetap berjalan. Yang ditambahkan:
--   * users  -> employees (+ jabatan, device_id, aktif) + profiles (auth)
--   * locations, patrol_checkpoints, patrol_logs, izin, settings
--   * kolom event pada attendance (type/status/timestamp_server/lat/lng/...)
--   * RPC get_server_now(), check_geofence()
--   * RLS per jabatan + bucket storage attendance/faces/izin
--
-- Urutan menjalankan (SQL Editor Supabase):
--   1) 20261023_base_schema.sql
--   2) 20261023_face_recognition.sql
--   3) 20261024_p1_backend.sql   <-- file ini
--   4) supabase/seed.sql         <-- akun demo + titik patroli
--
-- Aman dijalankan berulang (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

create extension if not exists postgis;
create extension if not exists vector;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 1. USERS
-- Satu "user" = satu baris employees + satu baris profiles (auth).
-- NIK dipakai sebagai email login: <nik>@absensi.local (dibuat di seed
-- / endpoint register). Password TIDAK disimpan di sini (Supabase Auth).
-- ------------------------------------------------------------
alter table employees
  add column if not exists jabatan text,
  add column if not exists device_id text,
  add column if not exists aktif boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill jabatan dari role lama (admin -> Chief) sebelum dibuat NOT NULL.
update employees e
   set jabatan = case
                   when p.role = 'admin' then 'Chief'
                   else 'Anggota'
                 end
  from profiles p
 where p.employee_id = e.id
   and e.jabatan is null;

update employees set jabatan = 'Anggota' where jabatan is null;

alter table employees alter column jabatan set default 'Anggota';
alter table employees alter column jabatan set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'employees_jabatan_check' and conrelid = 'public.employees'::regclass
  ) then
    alter table employees
      add constraint employees_jabatan_check
      check (jabatan in ('Chief', 'Danru', 'Anggota'));
  end if;
end $$;

-- device_id menyimpan HASH perangkat (bukan ID mentah) — lihat P14.
comment on column employees.device_id is 'Hash device terakhir yang dipakai login; berubah -> wajib registrasi wajah ulang.';
comment on column employees.jabatan is 'Chief (App Admin), Danru/Anggota (App Pengguna).';

-- Catatan wajah: P1 SENGAJA tidak menambah kolom embedding kedua.
-- Sumber kebenaran wajah tetap employee_faces.embedding (pgvector) yang
-- sudah dipakai pipeline aktif; P3 memutuskan/memigrasi ke embedding 512-d
-- supaya tidak ada dua kebenaran yang bisa berbeda.

-- ------------------------------------------------------------
-- 2. LOCATIONS — titik absen yang bisa dikelola Chief
-- ------------------------------------------------------------
create table if not exists locations (
  id           uuid primary key default gen_random_uuid(),
  nama         text not null,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  radius_meter integer not null default 100 check (radius_meter between 5 and 5000),
  alamat       text,
  aktif        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists locations_aktif_idx on locations (aktif);

-- ------------------------------------------------------------
-- 3. PATROLI
-- ------------------------------------------------------------
create table if not exists patrol_checkpoints (
  id           uuid primary key default gen_random_uuid(),
  nama         text not null,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  radius_meter integer not null default 50 check (radius_meter between 5 and 5000),
  urutan       integer not null check (urutan > 0),
  aktif        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists patrol_checkpoints_urutan_idx
  on patrol_checkpoints (urutan) where aktif;

create table if not exists patrol_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references employees(id) on delete cascade,
  titik_id         uuid not null references patrol_checkpoints(id) on delete cascade,
  tanggal          date not null default ((now() at time zone 'Asia/Jakarta')::date),
  timestamp_server timestamptz not null default now(),
  lat              double precision,
  lng              double precision,
  created_at       timestamptz not null default now()
);

create index if not exists patrol_logs_user_tanggal_idx
  on patrol_logs (user_id, tanggal desc);
create index if not exists patrol_logs_tanggal_idx
  on patrol_logs (tanggal desc);
-- Satu titik hanya boleh discan sekali per hari per anggota (progres 3/7).
create unique index if not exists patrol_logs_user_titik_tanggal_idx
  on patrol_logs (user_id, titik_id, tanggal);

-- ------------------------------------------------------------
-- 4. IZIN
-- ------------------------------------------------------------
create table if not exists izin (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references employees(id) on delete cascade,
  tanggal     date not null,
  alasan      text not null check (length(btrim(alasan)) between 3 and 1000),
  foto_url    text,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  catatan     text,
  reviewed_by uuid references employees(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists izin_user_tanggal_idx on izin (user_id, tanggal desc);
create index if not exists izin_status_idx on izin (status, tanggal desc);

-- ------------------------------------------------------------
-- 5. SETTINGS — jam kerja (sumber tunggal untuk status Terlambat)
-- ------------------------------------------------------------
create table if not exists settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('jam_masuk', '07:00'),
  ('jam_pulang', '17:00'),
  ('toleransi_menit', '15')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 6. ATTENDANCE — kolom event untuk App Pengguna/Admin
-- Model lama (1 baris per karyawan per tanggal, check_in_at/check_out_at)
-- TETAP dipakai. Kolom baru hanya cermin "event terakhir":
--   type = masuk/pulang, status = status hari itu, timestamp_server = jam
--   server event terakhir, lat/lng/titik_id/foto/face score = bukti event.
-- ------------------------------------------------------------
alter table attendance
  add column if not exists type text,
  add column if not exists status text,
  add column if not exists timestamp_server timestamptz,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists titik_id uuid references locations(id) on delete set null,
  add column if not exists foto_url text,
  add column if not exists face_match_score float;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_type_check') then
    alter table attendance
      add constraint attendance_type_check
      check (type is null or type in ('masuk', 'pulang')) not valid;
    alter table attendance validate constraint attendance_type_check;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'attendance_status_check') then
    alter table attendance
      add constraint attendance_status_check
      check (status is null or status in ('Hadir', 'Terlambat', 'Pulang', 'Izin', 'Tanpa Keterangan'))
      not valid;
    alter table attendance validate constraint attendance_status_check;
  end if;
end $$;

create index if not exists attendance_titik_idx on attendance (titik_id);
create index if not exists attendance_status_tanggal_idx on attendance (status, tanggal desc);

/**
 * Isi kolom event bila penulis (API lama / app baru) hanya mengirim
 * check_in_at / check_out_at. Nilai yang sudah diisi TIDAK ditimpa,
 * kecuali `type` saat pulang (type = event terakhir).
 *
 * Status "Terlambat" memakai settings.jam_masuk + toleransi_menit dan
 * dikonversi ke zona Asia/Jakarta — bukan jam perangkat.
 */
create or replace function attendance_sync_server_fields()
returns trigger
language plpgsql
as $$
declare
  v_jam_masuk   time := '07:00';
  v_toleransi   integer := 15;
begin
  select coalesce(value::time, v_jam_masuk) into v_jam_masuk
    from settings where key = 'jam_masuk';
  v_jam_masuk := coalesce(v_jam_masuk, '07:00');

  select coalesce(value::integer, v_toleransi) into v_toleransi
    from settings where key = 'toleransi_menit';
  v_toleransi := coalesce(v_toleransi, 15);

  if new.check_in_at is null and new.check_out_at is null then
    -- Baris izin / tanpa keterangan: tidak ada event absensi.
    return new;
  end if;

  if new.check_out_at is not null then
    new.type := 'pulang';
    new.status := coalesce(new.status, 'Pulang');
    new.timestamp_server := coalesce(new.timestamp_server, new.check_out_at);
    new.lat := coalesce(new.lat, new.check_out_lat);
    new.lng := coalesce(new.lng, new.check_out_long);
  else
    new.type := coalesce(new.type, 'masuk');
    if new.status is null then
      new.status := case
        when (new.check_in_at at time zone 'Asia/Jakarta')::time
             > v_jam_masuk + make_interval(mins => v_toleransi)
        then 'Terlambat'
        else 'Hadir'
      end;
    end if;
    new.timestamp_server := coalesce(new.timestamp_server, new.check_in_at);
    new.lat := coalesce(new.lat, new.check_in_lat);
    new.lng := coalesce(new.lng, new.check_in_long);
  end if;

  new.timestamp_server := coalesce(new.timestamp_server, now());
  return new;
end $$;

drop trigger if exists attendance_sync_server_fields_trg on attendance;
create trigger attendance_sync_server_fields_trg
  before insert or update of check_in_at, check_out_at, status
  on attendance
  for each row
  execute function attendance_sync_server_fields();

-- ------------------------------------------------------------
-- 7. RPC
-- ------------------------------------------------------------

-- Waktu server. SEMUA status absensi (Hadir/Terlambat/Pulang) dan
-- timestamp yang ditampilkan wajib memakai nilai ini, bukan jam HP.
create or replace function get_server_now()
returns timestamptz
language sql
stable
as $$ select now() $$;

revoke all on function get_server_now() from public;
grant execute on function get_server_now() to anon, authenticated, service_role;

/**
 * Validasi geofence memakai PostGIS ST_DWithin (meter, geography).
 * Mengembalikan semua titik absen aktif (atau satu titik bila
 * p_location_id diisi), terurut dari yang terdekat.
 */
create or replace function check_geofence(
  p_lat double precision,
  p_lng double precision,
  p_location_id uuid default null
)
returns table (
  location_id  uuid,
  nama         text,
  lat          double precision,
  lng          double precision,
  distance_m   double precision,
  radius_meter integer,
  inside       boolean
)
language sql
stable
as $$
  with posisi as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  )
  select l.id,
         l.nama,
         l.lat,
         l.lng,
         st_distance(st_setsrid(st_makepoint(l.lng, l.lat), 4326)::geography, p.g),
         l.radius_meter,
         st_dwithin(
           st_setsrid(st_makepoint(l.lng, l.lat), 4326)::geography,
           p.g,
           l.radius_meter
         )
    from locations l
   cross join posisi p
   where l.aktif
     and (p_location_id is null or l.id = p_location_id)
   order by distance_m asc;
$$;

revoke all on function check_geofence(double precision, double precision, uuid) from public;
grant execute on function check_geofence(double precision, double precision, uuid)
  to authenticated, service_role;

-- ------------------------------------------------------------
-- 8. RLS — bantuan identitas
-- SECURITY DEFINER supaya policy tidak rekursif ke profiles/employees.
-- ------------------------------------------------------------
create or replace function current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select employee_id from profiles where id = auth.uid();
$$;

create or replace function current_jabatan()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.jabatan
    from employees e
    join profiles p on p.employee_id = e.id
   where p.id = auth.uid();
$$;

create or replace function is_chief()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce(current_jabatan() = 'Chief', false) $$;

create or replace function is_danru()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce(current_jabatan() = 'Danru', false) $$;

-- Boleh melihat data seluruh tim (Danru + Chief).
create or replace function is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select is_chief() or is_danru() $$;

revoke all on function current_employee_id() from public;
revoke all on function current_jabatan() from public;
revoke all on function is_chief() from public;
revoke all on function is_danru() from public;
revoke all on function is_supervisor() from public;
grant execute on function current_employee_id() to authenticated, service_role;
grant execute on function current_jabatan() to authenticated, service_role;
grant execute on function is_chief() to authenticated, service_role;
grant execute on function is_danru() to authenticated, service_role;
grant execute on function is_supervisor() to authenticated, service_role;

-- ------------------------------------------------------------
-- 9. RLS — policy per role
-- Peran: Anggota = data sendiri; Danru = data tim + approval izin;
--        Chief = semua. Penulisan data master tetap lewat service role.
-- ------------------------------------------------------------
alter table employees          enable row level security;
alter table profiles           enable row level security;
alter table locations          enable row level security;
alter table patrol_checkpoints enable row level security;
alter table patrol_logs        enable row level security;
alter table izin               enable row level security;
alter table attendance         enable row level security;
alter table settings           enable row level security;

-- profiles: hanya baris sendiri (dipakai app untuk baca role/jabatan).
drop policy if exists "profiles: baca sendiri" on profiles;
create policy "profiles: baca sendiri" on profiles
  for select to authenticated
  using (id = auth.uid());

-- employees: diri sendiri atau atasan.
drop policy if exists "employees: sendiri atau atasan" on employees;
create policy "employees: sendiri atau atasan" on employees
  for select to authenticated
  using (id = current_employee_id() or is_supervisor());

-- locations / patrol_checkpoints: semua user login boleh baca; tulis Chief.
drop policy if exists "locations: baca semua" on locations;
create policy "locations: baca semua" on locations
  for select to authenticated using (aktif or is_supervisor());

drop policy if exists "locations: tulis chief" on locations;
create policy "locations: tulis chief" on locations
  for all to authenticated
  using (is_chief()) with check (is_chief());

drop policy if exists "checkpoints: baca semua" on patrol_checkpoints;
create policy "checkpoints: baca semua" on patrol_checkpoints
  for select to authenticated using (aktif or is_supervisor());

drop policy if exists "checkpoints: tulis chief" on patrol_checkpoints;
create policy "checkpoints: tulis chief" on patrol_checkpoints
  for all to authenticated
  using (is_chief()) with check (is_chief());

-- attendance: sendiri; atasan boleh baca semua.
drop policy if exists "attendance: sendiri atau atasan" on attendance;
create policy "attendance: sendiri atau atasan" on attendance
  for select to authenticated
  using (employee_id = current_employee_id() or is_supervisor());

drop policy if exists "attendance: tulis sendiri" on attendance;
create policy "attendance: tulis sendiri" on attendance
  for insert to authenticated
  with check (employee_id = current_employee_id());

drop policy if exists "attendance: ubah sendiri" on attendance;
create policy "attendance: ubah sendiri" on attendance
  for update to authenticated
  using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id());

-- patrol_logs: sendiri; atasan baca semua.
drop policy if exists "patrol_logs: sendiri atau atasan" on patrol_logs;
create policy "patrol_logs: sendiri atau atasan" on patrol_logs
  for select to authenticated
  using (user_id = current_employee_id() or is_supervisor());

drop policy if exists "patrol_logs: tulis sendiri" on patrol_logs;
create policy "patrol_logs: tulis sendiri" on patrol_logs
  for insert to authenticated
  with check (user_id = current_employee_id());

-- izin: sendiri; Danru/Chief baca semua & boleh approve/reject.
drop policy if exists "izin: sendiri atau atasan" on izin;
create policy "izin: sendiri atau atasan" on izin
  for select to authenticated
  using (user_id = current_employee_id() or is_supervisor());

drop policy if exists "izin: ajukan sendiri" on izin;
create policy "izin: ajukan sendiri" on izin
  for insert to authenticated
  with check (user_id = current_employee_id() and status = 'pending');

drop policy if exists "izin: approval atasan" on izin;
create policy "izin: approval atasan" on izin
  for update to authenticated
  using (is_supervisor())
  with check (is_supervisor());

-- settings: semua login boleh baca; tulis Chief.
drop policy if exists "settings: baca semua" on settings;
create policy "settings: baca semua" on settings
  for select to authenticated using (true);

drop policy if exists "settings: tulis chief" on settings;
create policy "settings: tulis chief" on settings
  for all to authenticated
  using (is_chief()) with check (is_chief());

-- employees/profiles tidak punya policy INSERT/UPDATE/DELETE:
-- pembuatan & perubahan akun hanya lewat service role (API/App Admin).

-- Grant eksplisit (Supabase default sudah memberi, ini pengaman).
grant select, insert, update on attendance to authenticated;
grant select, insert on patrol_logs to authenticated;
grant select, insert, update on izin to authenticated;
grant select on locations, patrol_checkpoints, settings, employees, profiles to authenticated;
grant insert, update, delete on locations, patrol_checkpoints to authenticated;
grant insert, update, delete on settings to authenticated;

-- ------------------------------------------------------------
-- 10. STORAGE — bucket attendance, faces, izin
-- Konvensi path: <employee_id>/<nama-file>
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('attendance', 'attendance', false),
  ('faces', 'faces', false),
  ('izin', 'izin', false)
on conflict (id) do nothing;

drop policy if exists "storage: unggah foto sendiri" on storage.objects;
create policy "storage: unggah foto sendiri" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('attendance', 'faces', 'izin')
    and (storage.foldername(name))[1] = current_employee_id()::text
  );

drop policy if exists "storage: baca foto sendiri" on storage.objects;
create policy "storage: baca foto sendiri" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('attendance', 'faces', 'izin')
    and (
      (storage.foldername(name))[1] = current_employee_id()::text
      or is_supervisor()
    )
  );

drop policy if exists "storage: hapus foto chief" on storage.objects;
create policy "storage: hapus foto chief" on storage.objects
  for delete to authenticated
  using (bucket_id in ('attendance', 'faces', 'izin') and is_chief());

-- ------------------------------------------------------------
-- 11. Verifikasi cepat (jalankan manual setelah migrasi)
-- ------------------------------------------------------------
-- select get_server_now();
-- select * from check_geofence(-7.988931, 112.627671);
-- select tablename, policyname from pg_policies
--  where schemaname = 'public' order by tablename;
-- select count(*) from settings;  -- 3
