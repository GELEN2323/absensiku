'use strict';

/**
 * Smoke test API end-to-end memakai akun sementara.
 * Akun, profil, karyawan, dan absensi yang dibuat akan dihapus lagi di akhir.
 *
 * Jalankan: node scripts/qa-smoke.js [baseUrl]
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Baca server/.env tanpa dependensi tambahan (dotenv hanya ada di server/).
const envFile = path.resolve(__dirname, '../server/.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

const BASE = (process.argv[2] || 'http://localhost:4000').replace(/\/$/, '');
const OFFICE = {
  lat: Number(process.env.OFFICE_LAT || -7.988931),
  lng: Number(process.env.OFFICE_LNG || 112.627671),
};

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const email = `qa-smoke-${stamp}@absensi.test`;
const password = `Qa!${stamp}`;
const regEmail = `qa-reg-${stamp}@absensi.test`;
const regNip = `QAREG-${stamp}`;

// JPEG 1x1 valid untuk menguji unggah foto absensi.
const PHOTO_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(pathname, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${BASE}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function main() {
  let userId = null;
  let employeeId = null;

  try {
    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;

    const employee = await db
      .from('employees')
      .insert({
        nip: `QA-${stamp}`,
        nama: 'QA Smoke Test',
        departemen: 'QA',
        email,
      })
      .select('id')
      .single();
    if (employee.error) throw employee.error;
    employeeId = employee.data.id;

    // Trigger di Supabase biasanya sudah membuat baris profil saat user dibuat,
    // jadi pakai upsert agar tetap aman untuk kedua kondisi.
    const profile = await db.from('profiles').upsert(
      {
        id: userId,
        email,
        role: 'admin',
        employee_id: employeeId,
        nama: 'QA Smoke Test',
      },
      { onConflict: 'id' }
    );
    if (profile.error) throw profile.error;

    // 1. Health
    const health = await api('/api/health');
    check('GET /api/health', health.status === 200 && health.json?.database === 'up', `status ${health.status}`);

    // 2. Login dengan NIP
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { identifier: `QA-${stamp}`, password },
    });
    const token = login.json?.token;
    check(
      'POST /api/auth/login (via NIP)',
      login.status === 200 && Boolean(token) && login.json?.user?.role === 'admin',
      `status ${login.status}`
    );
    if (!token) throw new Error('login gagal, tidak ada token');

    // 3. Sesi
    const me = await api('/api/auth/me', { token });
    check('GET /api/auth/me', me.status === 200 && me.json?.user?.employee?.nip === `QA-${stamp}`, `status ${me.status}`);

    // 4. Absen di luar radius harus ditolak
    const outside = await api('/api/attendance/check-in', {
      method: 'POST',
      token,
      body: { lat: OFFICE.lat + 0.05, lng: OFFICE.lng + 0.05 },
    });
    check('Geofence menolak lokasi jauh', outside.status === 422, `status ${outside.status}`);

    // 5. Sedikit di luar radius tapi akurasi GPS menjelaskan selisihnya -> diterima.
    const nearBoundary = await api('/api/attendance/check-in', {
      method: 'POST',
      token,
      body: { lat: OFFICE.lat + 0.00144, lng: OFFICE.lng, accuracy: 30 },
    });
    check(
      'Toleransi akurasi GPS (160 m + akurasi 30 m)',
      nearBoundary.status === 201,
      `status ${nearBoundary.status} ${nearBoundary.json?.error?.message || ''}`.trim()
    );

    // 6. Absen pulang duluan, lalu siapkan absensi baru untuk uji foto.
    const earlyOut = await api('/api/attendance/check-out', {
      method: 'POST',
      token,
      body: { lat: OFFICE.lat, lng: OFFICE.lng },
    });
    check('POST /api/attendance/check-out', earlyOut.status === 200, `status ${earlyOut.status}`);

    // Tanggal memakai zona waktu server (Asia/Jakarta), bukan UTC.
    const todayInfo = await api('/api/attendance/today', { token });
    const todayDate = todayInfo.json?.date;
    await db.from('attendance').delete().eq('employee_id', employeeId).eq('tanggal', todayDate);

    // 7. Absen masuk dengan foto selfie
    const checkIn = await api('/api/attendance/check-in', {
      method: 'POST',
      token,
      body: { lat: OFFICE.lat, lng: OFFICE.lng, accuracy: 12, photo: PHOTO_DATA_URL },
    });
    const photoUrl = checkIn.json?.record?.check_in_photo || null;
    check(
      'POST /api/attendance/check-in + foto',
      checkIn.status === 201 && Boolean(checkIn.json?.record?.check_in_at) && Boolean(photoUrl),
      `status ${checkIn.status}`
    );

    if (photoUrl) {
      const image = await fetch(photoUrl);
      const contentType = image.headers.get('content-type') || '';
      check(
        'Foto absensi bisa diakses publik',
        image.status === 200 && contentType.startsWith('image/'),
        `status ${image.status} ${contentType}`
      );
    } else {
      check('Foto absensi bisa diakses publik', false, 'URL foto kosong');
    }

    // 8. Absen masuk dua kali ditolak
    const duplicate = await api('/api/attendance/check-in', {
      method: 'POST',
      token,
      body: { lat: OFFICE.lat, lng: OFFICE.lng },
    });
    check('Check-in ganda ditolak', duplicate.status === 409, `status ${duplicate.status}`);

    // 9. Absen pulang dengan foto
    const checkOut = await api('/api/attendance/check-out', {
      method: 'POST',
      token,
      body: { lat: OFFICE.lat, lng: OFFICE.lng, accuracy: 15, photo: PHOTO_DATA_URL },
    });
    check(
      'POST /api/attendance/check-out + foto',
      checkOut.status === 200 && Boolean(checkOut.json?.record?.check_out_at),
      `status ${checkOut.status}`
    );
    check(
      'Record pulang memuat foto',
      Boolean(checkOut.json?.record?.check_out_photo),
      checkOut.json?.record?.check_out_photo || 'kosong'
    );

    // 10. Today + riwayat memuat foto
    const today = await api('/api/attendance/today', { token });
    check(
      'GET /api/attendance/today (foto)',
      today.status === 200 &&
        Boolean(today.json?.record?.check_in_at) &&
        Boolean(today.json?.record?.check_in_photo),
      `status ${today.status}`
    );

    const history = await api('/api/attendance?month=' + new Date().toISOString().slice(0, 7), { token });
    check(
      'GET /api/attendance (riwayat + foto)',
      history.status === 200 &&
        (history.json?.records?.length || 0) >= 1 &&
        Boolean(history.json?.records?.[0]?.check_in_photo),
      `status ${history.status}`
    );

    // 11. Admin
    const summary = await api('/api/admin/summary', { token });
    check('GET /api/admin/summary', summary.status === 200 && typeof summary.json?.totals?.employees === 'number', `status ${summary.status}`);

    const employees = await api('/api/admin/employees', { token });
    check('GET /api/admin/employees', employees.status === 200 && Array.isArray(employees.json?.employees), `status ${employees.status}`);

    const adminAttendance = await api('/api/admin/attendance', { token });
    check('GET /api/admin/attendance', adminAttendance.status === 200 && Array.isArray(adminAttendance.json?.records), `status ${adminAttendance.status}`);

    // 10. Endpoint admin butuh role admin
    const forbidden = await api('/api/admin/summary');
    check('Auth wajib untuk endpoint admin', forbidden.status === 401, `status ${forbidden.status}`);

    // 12. Registrasi mandiri
    const registered = await api('/api/auth/register', {
      method: 'POST',
      body: {
        nama: 'QA Register',
        nip: regNip,
        email: regEmail,
        departemen: 'QA',
        password,
      },
    });
    check(
      'POST /api/auth/register',
      registered.status === 201 && registered.json?.user?.employee?.nip === regNip,
      `status ${registered.status}`
    );

    const registerLogin = await api('/api/auth/login', {
      method: 'POST',
      body: { identifier: regEmail, password },
    });
    check(
      'Login setelah registrasi',
      registerLogin.status === 200 && registerLogin.json?.user?.role === 'karyawan',
      `status ${registerLogin.status}`
    );

    const duplicateNip = await api('/api/auth/register', {
      method: 'POST',
      body: {
        nama: 'QA Register 2',
        nip: regNip,
        email: `qa-reg2-${stamp}@absensi.test`,
        password,
      },
    });
    check('Registrasi NIP duplikat ditolak', duplicateNip.status === 409, `status ${duplicateNip.status}`);
  } finally {
    try {
      if (employeeId) {
        const folder = `attendance/${employeeId}`;
        const listed = await db.storage.from('employee-photos').list(folder);
        if (listed.data?.length) {
          await db.storage
            .from('employee-photos')
            .remove(listed.data.map((item) => `${folder}/${item.name}`));
        }
      }
      if (employeeId) await db.from('attendance').delete().eq('employee_id', employeeId);
      if (userId) await db.from('profiles').delete().eq('id', userId);
      if (employeeId) await db.from('employees').delete().eq('id', employeeId);
      if (userId) await db.auth.admin.deleteUser(userId);
      console.log('cleanup  akun sementara dihapus');
    } catch (error) {
      console.error('cleanup gagal:', error.message);
    }

    try {
      // Bersihkan akun hasil uji registrasi.
      const regProfile = await db.from('profiles').select('id').eq('email', regEmail).maybeSingle();
      const regEmployee = await db.from('employees').select('id').eq('nip', regNip).maybeSingle();
      if (regEmployee.data) await db.from('attendance').delete().eq('employee_id', regEmployee.data.id);
      if (regProfile.data) await db.from('profiles').delete().eq('id', regProfile.data.id);
      if (regEmployee.data) await db.from('employees').delete().eq('id', regEmployee.data.id);
      if (regProfile.data) await db.auth.admin.deleteUser(regProfile.data.id);
    } catch (error) {
      console.error('cleanup registrasi gagal:', error.message);
    }
  }

  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} cek lulus`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('SMOKE ERROR:', error.message);
  process.exit(1);
});
