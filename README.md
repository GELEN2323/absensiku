# Absensi Karyawan — Web App + API + WebView Shell

Aplikasi absensi (masuk/pulang) berbasis lokasi kantor. Satu basis kode berisi:

1. **Web app** (Expo Router / React Native Web) — login, absensi, riwayat, profil, dan panel admin.
2. **Backend API** (`server/`, Express + Supabase service role) — satu-satunya pintu ke database, validasi geofence & jam memakai waktu server.
3. **Aplikasi Android/iOS** — shell WebView yang membuka web app hasil deploy.

## Struktur

```
src/
  app/            # route web (expo-router)
    login.tsx
    register.tsx  # pendaftaran akun karyawan
    user/         # index (absensi), riwayat, profil
    admin/        # index (ringkasan), absensi, karyawan
  components/     # UI kit + WebViewShell (native) / fallback
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

# 2. Build web lalu jalankan API + web dalam satu proses
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

Untuk aplikasi Android/iOS, isi `EXPO_PUBLIC_WEBVIEW_URL` di `.env` dengan URL web
hasil deploy (mis. `https://absensi.example.com`), lalu `npm run android`.

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
| POST | `/api/auth/login` | publik (identifier: email atau NIP) |
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
| `npm run android` / `npm run ios` | Build aplikasi native (WebView shell) |

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
- Di Android/iOS, foto tetap berjalan di dalam WebView selama `EXPO_PUBLIC_WEBVIEW_URL`
  memakai **HTTPS** (browser memblokir kamera & GPS pada http biasa). WebView shell sudah
  mengizinkan permintaan kamera/lokasi native.
- Kalau kamera tidak tersedia atau izin ditolak, aplikasi menawarkan "Lanjut tanpa foto"
  agar absensi tidak macet (set `REQUIRE_PHOTO=1` untuk mewajibkannya di server).

## Deploy

1. `npm run build:web` → folder `dist/`.
2. Jalankan `server/` sebagai service (Railway/Fly/VPS), set env produksi, dan arahkan
   static web ke `dist/` (sudah otomatis karena server menyajikan `dist/`).
3. Isi `EXPO_PUBLIC_WEBVIEW_URL` dengan URL publik tersebut, lalu build aplikasi
   Android/iOS.

Build web sengaja mengosongkan `EXPO_PUBLIC_API_URL` supaya browser memanggil API
di origin yang sama, bukan `localhost` milik pengguna.
