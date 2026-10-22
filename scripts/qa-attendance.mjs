/**
 * QA UI absensi: izin lokasi + geolocation, tombol absen membuka kamera,
 * lalu absensi tercatat. Akun & data uji dihapus di akhir.
 *
 * node <skill>/browser.mjs http://localhost:4000/login --script ./scripts/qa-attendance.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envFile = path.resolve(process.cwd(), 'server/.env');
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const email = `qa-absen-${stamp}@absensi.test`;
const nip = `QAABSEN-${stamp}`;
const nama = 'QA Absen Test';
const password = `Absen!${stamp}`;

const OFFICE = {
  lat: Number(env.OFFICE_LAT || -7.988931),
  lng: Number(env.OFFICE_LNG || 112.627671),
};

// JPEG 1x1 valid untuk mensimulasikan foto absensi dari perangkat.
const PHOTO_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==',
  'base64'
);

async function cleanup(employeeId) {
  if (!employeeId) return;
  const folder = `attendance/${employeeId}`;
  const listed = await db.storage.from('employee-photos').list(folder);
  if (listed.data?.length) {
    await db.storage
      .from('employee-photos')
      .remove(listed.data.map((item) => `${folder}/${item.name}`));
  }
  await db.from('attendance').delete().eq('employee_id', employeeId);
}

export default async function run(page, ui) {
  const report = { steps: [], errors: [] };
  let userId = null;
  let employeeId = null;

  try {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;

    const employee = await db
      .from('employees')
      .insert({ nip, nama, departemen: 'QA', email })
      .select('id')
      .single();
    if (employee.error) throw employee.error;
    employeeId = employee.data.id;

    await db.from('profiles').upsert(
      { id: userId, email, role: 'karyawan', employee_id: employeeId, nama },
      { onConflict: 'id' }
    );

    const context = page.context();
    await context.grantPermissions(['geolocation', 'camera'], { origin: 'http://localhost:4000' });
    await context.setGeolocation({ latitude: OFFICE.lat, longitude: OFFICE.lng, accuracy: 8 });

    await page.goto('http://localhost:4000/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('input');

    let snap = await ui.snapshot();
    const emailRef = snap.match(/@(e\d+) textbox "nama@perusahaan\.com atau NIP"/)?.[1];
    const passRef = snap.match(/@(e\d+) textbox "Masukkan password"/)?.[1];
    if (!emailRef || !passRef) throw new Error('field login tidak ditemukan');

    await ui.fill(emailRef, email);
    await ui.fill(passRef, password);

    snap = await ui.snapshot();
    await ui.click(snap.match(/@(e\d+) button "Masuk"/)?.[1]);

    await page.waitForFunction(() => window.location.pathname.startsWith('/user'), { timeout: 25000 });

    // Lokasi otomatis terisi (di kantor -> jarak 0 m).
    await page.waitForFunction(
      () => /dari kantor|Di dalam radius/.test(document.body.innerText),
      { timeout: 25000 }
    );
    const located = await page.evaluate(() => ({
      distance: document.body.innerText.match(/(\d+(?:[.,]\d+)?\s?(?:m|km))\s*dari kantor/)?.[0] || null,
      inside: document.body.innerText.includes('Di dalam radius'),
      gps: document.body.innerText.includes('GPS belum aktif') ? 'off' : 'on',
    }));
    report.location = located;

    // Tombol absen masuk sekarang harus membuka kamera.
    await page.waitForTimeout(800);
    snap = await ui.snapshot();
    const cameraButton = snap.match(/@(e\d+) button "Ambil foto & absen masuk"/)?.[1];
    if (!cameraButton) {
      report.errors.push('tombol "Ambil foto & absen masuk" tidak muncul');
      report.snapshot = snap;
      return report;
    }

    await ui.click(cameraButton);
    await page.waitForTimeout(2500);

    // Tunggu sampai kamera siap atau jatuh ke tampilan fallback (tanpa kamera).
    report.cameraFallback = await page
      .waitForFunction(
        () => /Kamera tidak bisa dibuka|Gunakan foto/.test(document.body.innerText),
        { timeout: 12000 }
      )
      .then(() => true)
      .catch(() => false);

    const modal = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
    report.cameraModal = modal.includes('Foto absen masuk')
      ? 'terbuka'
      : modal.includes('Kamera tidak bisa dibuka')
        ? 'fallback'
        : 'tidak terlihat';

    const modalSnap = await ui.snapshot();
    report.cameraButtons = modalSnap
      .split('\n')
      .filter((line) => /button/.test(line))
      .map((line) => line.trim());

    if (/button "Gunakan foto"/.test(modalSnap)) {
      await ui.click(modalSnap.match(/@(e\d+) button "Gunakan foto"/)?.[1]);
      report.photo = 'preview-confirmed';
    } else {
      const skip = modalSnap.match(/@(e\d+) button "Lanjut tanpa foto"/)?.[1];
      if (skip) {
        await ui.click(skip);
        report.photo = 'skipped-no-camera';
      } else {
        const capture = modalSnap.match(/@(e\d+) button "Ambil foto"/)?.[1];
        if (capture) {
          await ui.click(capture);
          await page.waitForTimeout(2500);
          const afterCapture = await ui.snapshot();
          if (/button "Gunakan foto"/.test(afterCapture)) {
            await ui.click(afterCapture.match(/@(e\d+) button "Gunakan foto"/)?.[1]);
            report.photo = 'captured';
          }
        }
      }
    }

    await page.waitForFunction(
      () => /Absen masuk berhasil|Kamu sudah absen|Waktunya absen pulang/.test(document.body.innerText),
      { timeout: 25000 }
    );

    // Status harus langsung berubah tanpa perlu refresh manual.
    await page.waitForTimeout(3000);
    report.immediatelyAfterSubmit = await page.evaluate(() => ({
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 220),
      hadir: document.body.innerText.includes('Hadir'),
      checkInTime: /Masuk \d{2}[.:]\d{2}/.test(document.body.innerText),
    }));

    // Perubahan posisi harus ikut terpantau (watchPosition).
    await context.setGeolocation({
      latitude: OFFICE.lat + 0.01,
      longitude: OFFICE.lng,
      accuracy: 10,
    });
    const updated = await page
      .waitForFunction(() => /1[.,]\d\s?km|1\.1\s?km/.test(document.body.innerText), { timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    report.watchUpdated = updated;

    // Cek apakah tombol muat ulang menampilkan data (membedakan cache vs state).
    const refreshSnap = await ui.snapshot();
    const refreshRef = refreshSnap.match(/@(e\d+) button "Muat ulang data absensi"/)?.[1];
    if (refreshRef) {
      await ui.click(refreshRef);
      await page.waitForTimeout(3000);
    }
    report.afterManualRefresh = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, ' ').slice(0, 240)
    );

    // Simulasikan foto tersimpan (kamera asli tidak ada di headless), lalu
    // pastikan UI menampilkannya setelah refresh.
    if (employeeId) {
      const todayRow = await db
        .from('attendance')
        .select('tanggal')
        .eq('employee_id', employeeId)
        .maybeSingle();
      const dateKey = todayRow.data?.tanggal || new Date().toISOString().slice(0, 10);
      const path = `attendance/${employeeId}/${dateKey}-in.jpg`;
      const uploaded = await db.storage.from('employee-photos').upload(path, PHOTO_BUFFER, {
        upsert: true,
        contentType: 'image/jpeg',
      });
      report.simulatedPhoto = uploaded.error ? uploaded.error.message : path;

      const snapAfter = await ui.snapshot();
      const refreshAgain = snapAfter.match(/@(e\d+) button "Muat ulang data absensi"/)?.[1];
      if (refreshAgain) {
        await ui.click(refreshAgain);
        await page.waitForTimeout(3000);
      }

      report.photoImages = await page.evaluate(() =>
        Array.from(document.querySelectorAll('img'))
          .map((img) => img.getAttribute('src') || '')
          .filter((src) => src.includes('/employee-photos/'))
          .length
      );

      // Riwayat juga harus menampilkan thumbnail foto.
      await page.goto('http://localhost:4000/user/riwayat', { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      report.riwayatPhotos = await page.evaluate(() =>
        Array.from(document.querySelectorAll('img'))
          .map((img) => img.getAttribute('src') || '')
          .filter((src) => src.includes('/employee-photos/'))
          .length
      );
    }

    const record = await db
      .from('attendance')
      .select('id, tanggal, check_in_at, check_in_lat, check_in_long')
      .eq('employee_id', employeeId)
      .maybeSingle();

    report.database = record.data
      ? {
          tanggal: record.data.tanggal,
          check_in: Boolean(record.data.check_in_at),
          lat: record.data.check_in_lat,
          lng: record.data.check_in_long,
        }
      : null;

    const stored = await db.storage.from('employee-photos').list(`attendance/${employeeId}`);
    report.storedPhotos = (stored.data || []).map((item) => item.name);

    report.finalText = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, ' ').slice(0, 320)
    );

    // Bandingkan tampilan dengan respons API memakai token yang tersimpan.
    report.apiToday = await page.evaluate(async () => {
      const raw = localStorage.getItem('absensi-auth');
      const token = raw ? JSON.parse(raw)?.state?.token : null;
      if (!token) return { token: false };
      const response = await fetch('/api/attendance/today', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json().catch(() => null);
      return {
        token: true,
        status: response.status,
        date: json?.date || null,
        checkIn: json?.record?.check_in_at || null,
      };
    });

    return report;
  } catch (error) {
    report.errors.push(error.message);
    report.lastUrl = page.url();
    report.lastText = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)
    );
    return report;
  } finally {
    await cleanup(employeeId);
    if (userId) {
      await db.from('profiles').delete().eq('id', userId);
      if (employeeId) await db.from('employees').delete().eq('id', employeeId);
      await db.auth.admin.deleteUser(userId);
    }
  }
}
