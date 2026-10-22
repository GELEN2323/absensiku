/**
 * QA UI web: login dengan akun sementara, cek dashboard admin & halaman user,
 * lalu hapus akun sementara tersebut.
 *
 * Dijalankan lewat browser-automation:
 * node <skill>/browser.mjs http://localhost:4000/login --script ./scripts/qa-browser.mjs
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
const email = `qa-ui-${stamp}@absensi.test`;
const password = `Qa!${stamp}`;
const nip = `QAUI-${stamp}`;
const role = process.env.QA_ROLE === 'karyawan' ? 'karyawan' : 'admin';

async function createAccount() {
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;

  const employee = await db
    .from('employees')
    .insert({ nip, nama: 'QA UI Test', departemen: 'QA', email })
    .select('id')
    .single();
  if (employee.error) throw employee.error;

  const profile = await db
    .from('profiles')
    .upsert(
      { id: created.data.user.id, email, role, employee_id: employee.data.id, nama: 'QA UI Test' },
      { onConflict: 'id' }
    );
  if (profile.error) throw profile.error;

  return { userId: created.data.user.id, employeeId: employee.data.id };
}

async function cleanup({ userId, employeeId }) {
  if (employeeId) await db.from('attendance').delete().eq('employee_id', employeeId);
  if (userId) await db.from('profiles').delete().eq('id', userId);
  if (employeeId) await db.from('employees').delete().eq('id', employeeId);
  if (userId) await db.auth.admin.deleteUser(userId);
}

export default async function run(page, ui) {
  const account = await createAccount();
  const report = { email, steps: [], errors: [] };

  try {
    await page.goto('http://localhost:4000/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('input');

    let snap = await ui.snapshot();
    report.steps.push(`login page: ${snap.split('\n').length} elemen`);

    const emailRef = snap.match(/@(e\d+) textbox "nama@perusahaan\.com atau NIP"/)?.[1];
    const passRef = snap.match(/@(e\d+) textbox "Masukkan password"/)?.[1];
    if (!emailRef || !passRef) throw new Error('field login tidak ditemukan');

    await ui.fill(emailRef, email);
    await ui.fill(passRef, password);

    snap = await ui.snapshot();
    const submitRef = snap.match(/@(e\d+) button "Masuk"/)?.[1];
    if (!submitRef) throw new Error('tombol Masuk tidak ditemukan');
    await ui.click(submitRef);

    // Dashboard sesuai role harus muncul setelah login.
    await page.waitForFunction(
      (expected) => window.location.pathname.startsWith(expected),
      role === 'admin' ? '/admin' : '/user',
      { timeout: 20000 }
    );
    await page.waitForTimeout(1500);

    report.steps.push(`redirect setelah login: ${new URL(page.url()).pathname}`);
    const dashboard = await page.evaluate(() => ({
      path: window.location.pathname,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600),
    }));
    report.dashboard = dashboard;

    // Halaman karyawan (tab absensi) untuk memastikan route user juga hidup.
    await page.goto('http://localhost:4000/user', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    report.userPage = await page.evaluate(() => ({
      path: window.location.pathname,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
    }));

    // Reload untuk memastikan sesi tersimpan (persist) dan tidak terlempar ke login.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    report.afterReload = await page.evaluate(() => ({
      path: window.location.pathname,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
    }));

    return report;
  } catch (error) {
    report.errors.push(error.message);
    report.lastUrl = page.url();
    report.lastText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500));
    return report;
  } finally {
    await cleanup(account);
  }
}
