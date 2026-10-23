# Absensi Karyawan — App Pengguna (native) + Web App + API

Aplikasi absensi (masuk/pulang) berbasis lokasi kantor. Satu basis kode berisi:

1. **App Pengguna** (Expo Router native, `com.absensi.user`) — login NIK, absensi, riwayat,
   patroli, profil untuk jabatan **Danru/Anggota**.
2. **Web app** (React Native Web) — versi browser dari layar yang sama, plus panel admin lama.
3. **Backend API** (`server/`, Express + Supabase service role) — satu-satunya pintu ke database, validasi geofence & jam memakai waktu server.

App Admin (Chief) dibangun terpisah pada tahap P8 dengan package `com.absensi.admin`.

## Struktur

```
src/
  app/            # route expo-router (native + web)
    login.tsx
    lupa-sandi.tsx # kirim link reset password lewat NIK
    register.tsx   # pendaftaran akun (dipakai web/API)
    user/          # tab: index (absen), riwayat, patroli, profil
                    # _layout.tsx juga menolak akun Chief
    admin/         # panel admin web (dipindah ke App Admin pada P8)
  components/     # UI kit (Screen, Card, Button, TextField, ...)
  lib/            # api client, format, geo, types
  store/auth.ts   # sesi (token + user) via Zustand + AsyncStorage
server/
  src/            # Express API, auth Supabase, geofence, admin
scripts/          # build web, smoke test API, QA browser
dist/             # hasil `npm run build:web` (dipakai server untuk serve web)
legacy/           # screen lama yang rusak (referensi saja, tidak dipakai)
```

## Menjalankan

```bash
npm install
npm --prefix server install

# 1. Isi kredensial Supabase (JANGAN commit)
#    server/.env  -> SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#    .env         -> EXPO_PUBLIC_API_URL=http://localhost:4000

# 2. Jalankan migrasi di Supabase SQL Editor, urut nama file:
#    supabase/migrations/20261023_base_schema.sql      -> employees, profiles, attendance, bucket foto
#    supabase/migrations/20261023_face_recognition.sql -> tabel wajah, RPC, RLS
#    supabase/migrations/20261024_p1_backend.sql       -> lokasi, patroli, izin, settings, RLS jabatan
#    supabase/seed.sql                                 -> 3 akun demo + 1 kantor + 7 titik patroli

# 3. Build web lalu jalankan API + web dalam satu proses
npm run build:web
npm run serve
# Web  : http://localhost:4000
# API  : http://localhost:4000/api
```

Mode pengembangan terpisah (hot reload):

```bash
npm run api:dev     # API di :4000
npm run web         # Expo dev server di :8081
```

Untuk aplikasi Android/iOS, jalankan `npm run android` (development build). App Pengguna
memakai layar native, bukan WebView; `EXPO_PUBLIC_API_URL` harus menunjuk ke API yang
bisa diakses perangkat (mis. `http://192.168.1.10:4000`, bukan `localhost`).

## Backend P1 — satu Supabase untuk dua aplikasi

P1 menambah fondasi untuk **App Pengguna** (Anggota/Danru) dan **App Admin** (Chief).
Migrasi bersifat aditif: skema dan API lama tetap dipakai, tidak ada tabel yang di-drop.

| Brief | Implementasi di repo |
|---|---|
| `users` | `employees` (nip, nama, jabatan, device_id, aktif) + `profiles` (auth, role) |
| `locations` | tabel baru, titik absen dengan lat/lng + `radius_meter` |
| `attendance` | tabel lama (1 baris/hari) + kolom event: `type`, `status`, `timestamp_server`, `lat`, `lng`, `titik_id`, `foto_url`, `face_match_score` |
| `patrol_checkpoints`, `patrol_logs` | tabel baru; `patrol_logs` unik per user+titik+tanggal |
| `izin` | tabel baru, status `pending/approved/rejected` + `reviewed_by` |
| `settings` | `jam_masuk`, `jam_pulang`, `toleransi_menit` (seed otomatis) |

RPC:

- `get_server_now()` — satu-satunya sumber waktu untuk status absensi (anti fake timer).
- `check_geofence(lat, lng, location_id?)` — jarak tiap titik absen + `inside`, dihitung
  dengan PostGIS `ST_DWithin` (meter) di server, bukan di HP.

RLS (role dari `employees.jabatan`, dibaca lewat `profiles.employee_id`):

| Tabel | Anggota | Danru | Chief |
|---|---|---|---|
| `employees`, `attendance`, `patrol_logs`, `izin` | baris sendiri | semua tim | semua |
| `locations`, `patrol_checkpoints`, `settings` | baca | baca | baca + tulis |
| `izin` (update) | – | approve/reject | approve/reject |
| `employee_faces`, `face_attempt_logs`, `face_verifications` | hanya service role | hanya service role | hanya service role |

Storage: bucket privat `attendance`, `faces`, `izin` dengan path `<employee_id>/<file>`.
Foto lama tetap di bucket `employee-photos` (dipakai web app).

Akun seed (`supabase/seed.sql`), password semuanya `Absensi123!` — ganti sebelum dipakai:

| NIK | Nama | Jabatan | Email auth |
|---|---|---|---|
| `CHIEF001` | Budi Santoso | Chief | `chief001@absensi.local` |
| `DANRU001` | Andi Pratama | Danru | `danru001@absensi.local` |
| `ANGGOTA001` | Citra Lestari | Anggota | `anggota001@absensi.local` |

Login App Pengguna memakai **NIK** (`DANRU001` / `ANGGOTA001`), bukan email. Email hanya
identitas internal Supabase Auth.

Catatan wajah: P1 tidak menambah kolom embedding kedua. Sumber kebenaran tetap
`employee_faces.embedding` (pipeline aktif 128-d); perubahan ke 512-d dibahas di P3.

## App Pengguna (P2)

- **Login**: NIK + password. Server memetakan NIK ke email auth (`<nik>@absensi.local`),
  jadi karyawan tidak perlu tahu/mengetik email.
- **Pembatasan jabatan**: hanya `Danru` dan `Anggota` yang bisa masuk. Akun `Chief`
  langsung ditolak di layar login dan, kalau sesinya tersimpan, di layout tab:
  "Gunakan aplikasi admin".
- **Tab**: Absensi, Riwayat, Patroli, Profil. Tab Patroli masih kerangka; peta, geofence,
  dan selfie verifikasi diisi di P6.
- **Lupa password**: `POST /api/auth/forgot-password` mencari email dari NIK lalu meminta
  Supabase mengirim link reset (butuh SMTP aktif di dashboard Supabase dan
  `PASSWORD_RESET_REDIRECT_URL` bila memakai deep link). Respons selalu generik supaya NIP
  tidak bisa ditebak.
- **Profil**: NIK/NIP, nama, jabatan, foto, info perangkat (nama, OS, versi app), ganti
  password, dan logout.

## Konfigurasi server (`server/.env`)

| Variabel | Keterangan |
|---|---|
| `PORT` | Port API (default `4000`) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Kredensial publik proyek Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Hanya di server, dipakai untuk baca/tulis data |
| `WEB_ORIGINS` | Origin frontend yang diizinkan (dipisah koma) |
| `OFFICE_NAME`, `OFFICE_LAT`, `OFFICE_LNG`, `OFFICE_RADIUS_M` | Titik & radius kantor |
| `ENFORCE_GEOFENCE` | `true` = absensi di luar radius ditolak |
| `GEOFENCE_ACCURACY_MARGIN_M` | Toleransi galat GPS (default 25 m): posisi sedikit di luar radius tetap diterima bila akurasi menjelaskan selisihnya |
| `MAX_ACCURACY_M` | Akurasi GPS terburuk yang diterima (default 100 m) |
| `REQUIRE_LOCATION` | `true` = absensi wajib membawa GPS |
| `REQUIRE_PHOTO` | `true` = foto selfie wajib sebelum absen |
| `MAX_PHOTO_MB` | Batas ukuran foto absensi (default 3 MB) |
| `WORK_START`, `WORK_END`, `LATE_TOLERANCE_MIN` | Jam kerja untuk status Hadir/Terlambat |
| `GEOCODE_ENABLED` | Reverse geocoding alamat (opsional) |

## Endpoint API

| Method | Path | Akses |
|---|---|---|
| GET | `/api/health` | publik |
| GET | `/api/office` | publik |
| POST | `/api/auth/register` | publik (nama, NIP, email, password) |
| POST | `/api/auth/login` | publik (identifier: NIK atau email) |
| POST | `/api/auth/forgot-password` | publik (NIK, kirim link reset ke email) |
| POST | `/api/auth/refresh` | publik (refresh token) |
| GET | `/api/auth/me` | login |
| POST | `/api/auth/password` | login |
| POST | `/api/auth/logout` | login |
| GET | `/api/attendance/today` | login |
| GET | `/api/attendance?month=YYYY-MM` | login |
| POST | `/api/attendance/check-in` | login |
| POST | `/api/attendance/check-out` | login |
| GET | `/api/admin/summary` | admin |
| GET | `/api/admin/employees` | admin |
| GET | `/api/admin/attendance` | admin |
| GET | `/api/admin/employees/:id` | admin |

Registrasi mandiri membuat auth user, baris `employees`, dan `profiles` dengan role
`karyawan` sekaligus. Jika salah satu langkah gagal, semuanya di-rollback. NIP dan email
harus unik; role admin tetap hanya bisa diberikan lewat database/admin panel.

Jam absensi selalu memakai waktu server (`new Date()` di API), bukan jam perangkat.
Geofence dihitung di server dari `OFFICE_*`, jadi koordinat dari client hanya usulan.

## Skrip

| Perintah | Fungsi |
|---|---|
| `npm run serve` | Jalankan API + serve `dist/` di satu port |
| `npm run api:dev` | API dengan `--watch` |
| `npm run web` | Expo dev server (web) |
| `npm run build:web` | Build web production ke `dist/` (API same-origin) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run qa:api` | Smoke test API end-to-end termasuk foto & geofence (akun sementara, dihapus otomatis) |
| `node scripts/qa-attendance.mjs` | QA browser: izin GPS, jarak kantor, buka kamera, absen |
| `node scripts/qa-register.mjs` | QA browser: isi form pendaftaran sampai masuk dashboard |
| `npm run android` / `npm run ios` | Build aplikasi native App Pengguna |

## Kamera & lokasi

- **Lokasi**: layar absensi langsung meminta izin GPS, memakai `enableHighAccuracy` dan
  `maximumAge: 0`, lalu memantau posisi (`watchPosition`) supaya jarak ke kantor ikut
  berubah saat pengguna bergerak. Pesan error membedakan izin ditolak, GPS mati,
  timeout, dan halaman non-HTTPS.
- **Kamera**: tombol absen membuka kamera depan (`expo-camera`), pengguna melihat preview,
  bisa ambil ulang, lalu foto dikirim ke API sebagai data URL. Server menyimpannya di
  bucket Supabase Storage `employee-photos` pada
  `attendance/<employee_id>/<tanggal>-in|out.jpg` (menimpa foto lama untuk hari yang sama).
  URL foto ikut di respons absensi, `/api/attendance/today`, riwayat, dan detail karyawan admin.
- Di Android/iOS, kamera & GPS memakai modul native (`expo-camera`, `expo-location`).
  Di web, keduanya hanya berjalan pada HTTPS/localhost.
- Kalau kamera tidak tersedia atau izin ditolak, aplikasi menawarkan "Lanjut tanpa foto"
  agar absensi tidak macet (set `REQUIRE_PHOTO=1` untuk mewajibkannya di server).

## Deploy

1. `npm run build:web` → folder `dist/`.
2. Jalankan `server/` sebagai service (Railway/Fly/VPS), set env produksi, dan arahkan
   static web ke `dist/` (sudah otomatis karena server menyajikan `dist/`).
3. Build App Pengguna dengan EAS (`expo prebuild` + development client) setelah
   `EXPO_PUBLIC_API_URL` menunjuk ke API produksi.

Build web sengaja mengosongkan `EXPO_PUBLIC_API_URL` supaya browser memanggil API
di origin yang sama, bukan `localhost` milik pengguna.
# absensiku
