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

Catatan wajah: sumber kebenaran tetap `employee_faces.embedding` (pipeline aktif 128-d).
Keputusan P3: registrasi dan verifikasi tetap diproses di server (face-api 128-d,
threshold Euclidean 0.45), bukan ArcFace 512-d on-device.

## App Pengguna (P2)

- **Login**: NIK + password. Server memetakan NIK ke email auth (`<nik>@absensi.local`),
  jadi karyawan tidak perlu tahu/mengetik email.
- **Pembatasan jabatan**: hanya `Danru` dan `Anggota` yang bisa masuk. Akun `Chief`
  langsung ditolak di layar login dan, kalau sesinya tersimpan, di layout tab:
  "Gunakan aplikasi admin".
- **Tab**: Absensi, Riwayat, Patroli, Profil. Halaman pendukung (registrasi wajah,
  pengajuan izin) bukan tab tambahan, melainkan route tersembunyi yang dibuka dari
  Absensi/Riwayat/Profil.
- **Lupa password**: `POST /api/auth/forgot-password` mencari email dari NIK lalu meminta
  Supabase mengirim link reset (butuh SMTP aktif di dashboard Supabase dan
  `PASSWORD_RESET_REDIRECT_URL` bila memakai deep link). Respons selalu generik supaya NIP
  tidak bisa ditebak.
- **Profil**: NIK/NIP, nama, jabatan, foto, info perangkat (nama, OS, versi app), status
  wajah, tautan izin, ganti password, dan logout.

## App Pengguna (P3–P7)

- **P3 — Registrasi wajah** (`/user/wajah`): tiga pose berurutan (depan, kiri, kanan)
  lewat kamera depan. Foto dikirim ke `/api/face/enroll`, server membuat embedding 128-d
  dan menyimpan di `employee_faces`. Foto mentah tidak disimpan.
- **P4 — Absensi**: wajib GPS dalam radius lokasi (`locations`, PostGIS `ST_DWithin`),
  akurasi GPS ≤ 50 m, mock location ditolak, dan wajib liveness acak + pencocokan wajah.
  Tantangan liveness dipilih acak (`blink_twice` atau `close_eyes`, maksimal 3 percobaan).
  `/api/face/verify` mengembalikan `verification_id` sekali pakai (berlaku 2 menit) yang
  kemudian dikirim ke check-in/check-out. Jam, tanggal, dan status Hadir/Terlambat memakai
  `get_server_now()` + tabel `settings`. Foto yang disimpan adalah frame terakhir liveness
  dengan watermark NIK, nama, waktu server, dan lokasi.
- **P5 — Riwayat**: daftar absensi terbaru, jam masuk/pulang, durasi, status berwarna
  (Hadir hijau, Terlambat kuning, Pulang biru, Izin ungu, Tanpa Keterangan abu-abu),
  filter bulan, pull-to-refresh, dan empty state.
- **P6 — Patroli**: peta titik `patrol_checkpoints` berurutan, tombol "Scan Titik Ini"
  memvalidasi geofence titik + selfie face match cepat (tanpa liveness) lalu menulis
  `patrol_logs`. Titik yang sudah discan berubah hijau, progres "3/7", banner selesai,
  dan riwayat patroli per tanggal.
- **P7 — Izin** (`/user/izin`): form tanggal + alasan + foto pendukung opsional, status
  awal `pending`, daftar pengajuan sendiri beserta status dan catatan atasan.

> Catatan Android: peta patroli memakai `react-native-maps`, sehingga Google Maps API key
> harus dikonfigurasi di `app.json`/EAS sebelum build Android. Di web dipakai fallback peta
> skematik (`PatrolMap.web.tsx`).

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
| `MAX_ACCURACY_M` | Akurasi GPS terburuk yang diterima (default 50 m), lebih buruk → minta menunggu |
| `REQUIRE_LOCATION` | `true` = absensi wajib membawa GPS |
| `REQUIRE_PHOTO` | `true` = foto selfie wajib sebelum absen (foto liveness selalu dikirim) |
| `MAX_PHOTO_MB` | Batas ukuran foto absensi (default 3 MB) |
| `PHOTO_BODY_LIMIT` | Batas body JSON endpoint berfoto (default `8mb`) |
| `WORK_START`, `WORK_END`, `LATE_TOLERANCE_MIN` | Fallback jam kerja; nilai aktif dibaca dari tabel `settings` |
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
| GET | `/api/attendance/today` | login (opsional `lat`/`lng` → lokasi terdekat) |
| GET | `/api/attendance?month=YYYY-MM` | login |
| POST | `/api/attendance/check-in` | login (`verification_id` + foto + GPS) |
| POST | `/api/attendance/check-out` | login (`verification_id` + foto + GPS) |
| GET | `/api/face/status` | login |
| POST | `/api/face/enroll` | login (3 foto pose) |
| POST | `/api/face/verify` | login (frame liveness + tantangan) |
| GET | `/api/patrol/today` | login |
| POST | `/api/patrol/scan` | login (checkpoint + GPS + selfie) |
| GET | `/api/patrol/history` | login |
| GET | `/api/izin?month=YYYY-MM` | login |
| POST | `/api/izin` | login (tanggal, alasan, foto opsional) |
| GET | `/api/admin/summary` | admin |
| GET | `/api/admin/employees` | admin |
| GET | `/api/admin/attendance` | admin |
| GET | `/api/admin/employees/:id` | admin |

Registrasi mandiri membuat auth user, baris `employees`, dan `profiles` dengan role
`karyawan` sekaligus. Jika salah satu langkah gagal, semuanya di-rollback. NIP dan email
harus unik; role admin tetap hanya bisa diberikan lewat database/admin panel.

Jam absensi selalu memakai waktu server (`get_server_now()` di Supabase), bukan jam
perangkat. Geofence dihitung di server dari tabel `locations` (`ST_DWithin`) dengan
fallback `OFFICE_*`; koordinat dari client hanya usulan.

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
- **Kamera**: absensi memakai kamera depan untuk tantangan liveness (kedip dua kali atau
  tutup mata) dan selfie registrasi wajah. Frame terakhir liveness dikirim sebagai foto
  absensi, disimpan di bucket `employee-photos` pada
  `attendance/<employee_id>/<tanggal>-in|out.jpg` dengan watermark NIK + waktu server.
  URL foto ikut di respons absensi, `/api/attendance/today`, riwayat, dan detail admin.
- Patroli memakai selfie singkat tanpa liveness untuk pencocokan cepat di titik patroli.
- Di Android/iOS, kamera & GPS memakai modul native (`expo-camera`, `expo-location`).
  Di web, keduanya hanya berjalan pada HTTPS/localhost.
- Absensi tidak bisa dilanjutkan tanpa verifikasi wajah; kalau kamera tidak tersedia,
  pengguna diarahkan untuk memakai perangkat lain atau menghubungi admin.

## Deploy

1. `npm run build:web` → folder `dist/`.
2. Jalankan `server/` sebagai service (Railway/Fly/VPS), set env produksi, dan arahkan
   static web ke `dist/` (sudah otomatis karena server menyajikan `dist/`).
3. Build App Pengguna dengan EAS (`expo prebuild` + development client) setelah
   `EXPO_PUBLIC_API_URL` menunjuk ke API produksi.

Build web sengaja mengosongkan `EXPO_PUBLIC_API_URL` supaya browser memanggil API
di origin yang sama, bukan `localhost` milik pengguna.
# absensiku
