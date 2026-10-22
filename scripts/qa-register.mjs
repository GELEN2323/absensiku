/**
 * QA UI pendaftaran: isi form register di web, pastikan akun dibuat dan langsung
 * masuk ke dashboard karyawan, lalu hapus akun uji tersebut.
 *
 * node <skill>/browser.mjs http://localhost:4000/register --script ./scripts/qa-register.mjs
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
const email = `qa-form-${stamp}@absensi.test`;
const nip = `QAFORM-${stamp}`;
const nama = 'QA Form Test';
const password = `Form!${stamp}`;

async function cleanup() {
  const profile = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  const employee = await db.from('employees').select('id').eq('nip', nip).maybeSingle();
  if (employee.data) await db.from('attendance').delete().eq('employee_id', employee.data.id);
  if (profile.data) await db.from('profiles').delete().eq('id', profile.data.id);
  if (employee.data) await db.from('employees').delete().eq('id', employee.data.id);
  if (profile.data) await db.auth.admin.deleteUser(profile.data.id);
}

export default async function run(page, ui) {
  const report = { email, nip, steps: [], errors: [] };

  try {
    await page.goto('http://localhost:4000/register', { waitUntil: 'networkidle' });
    await page.waitForSelector('input');

    const snap = await ui.snapshot();
    const refFor = (pattern) => snap.match(new RegExp(`@(e\\d+) textbox "${pattern}"`))?.[1];

    const refs = {
      nama: refFor('Nama sesuai data perusahaan'),
      nip: refFor('Nomor induk karyawan'),
      email: refFor('nama@perusahaan\\.com'),
      departemen: refFor('Contoh: Security, Operasional'),
      password: refFor('Minimal 6 karakter'),
      confirm: refFor('Ulangi password'),
    };
    report.steps.push(`field terdeteksi: ${Object.entries(refs).filter(([, v]) => v).map(([k]) => k).join(', ')}`);

    if (Object.values(refs).some((value) => !value)) {
      report.errors.push('sebagian field registrasi tidak ditemukan');
      report.snapshot = snap;
      return report;
    }

    await ui.fill(refs.nama, nama);
    await ui.fill(refs.nip, nip);
    await ui.fill(refs.email, email);
    await ui.fill(refs.departemen, 'QA');
    await ui.fill(refs.password, password);
    await ui.fill(refs.confirm, password);

    const filled = await ui.snapshot();
    const submit = filled.match(/@(e\d+) button "Daftar & masuk"/)?.[1];
    if (!submit) {
      report.errors.push('tombol Daftar & masuk tidak ditemukan');
      return report;
    }

    await ui.click(submit);
    await page.waitForFunction(() => window.location.pathname.startsWith('/user'), { timeout: 25000 });
    await page.waitForTimeout(1500);

    report.afterRegister = await page.evaluate(() => ({
      path: window.location.pathname,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
    }));

    const stored = await db.from('profiles').select('email, role').eq('email', email).maybeSingle();
    report.database = stored.data || null;

    return report;
  } catch (error) {
    report.errors.push(error.message);
    report.lastUrl = page.url();
    report.lastText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
    return report;
  } finally {
    await cleanup();
  }
}
