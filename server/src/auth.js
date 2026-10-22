'use strict';

const { db, authClient } = require('./supabase');
const config = require('./config');
const { HttpError, unauthorized, forbidden } = require('./errors');

function normalizeRole(role) {
  return String(role || '').toLowerCase() === 'admin' ? 'admin' : 'karyawan';
}

function employeeName(profile, employee) {
  return (
    profile?.nama ||
    employee?.nama ||
    String(profile?.email || '').split('@')[0] ||
    'Pengguna'
  );
}

async function loadUserContext(userId) {
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, email, role, employee_id, nama')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) throw profileError;

  let employee = null;
  if (profile?.employee_id) {
    const { data, error } = await db
      .from('employees')
      .select('id, nip, nama, departemen, email, photo_url, face_registered')
      .eq('id', profile.employee_id)
      .maybeSingle();
    if (error) throw error;
    employee = data;
  }

  return { profile, employee };
}

function serializeUser(context) {
  const { profile, employee } = context;
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    role: normalizeRole(profile.role),
    nama: employeeName(profile, employee),
    employee: employee
      ? {
          id: employee.id,
          nip: employee.nip,
          nama: employee.nama,
          departemen: employee.departemen,
          email: employee.email,
          photo_url: employee.photo_url,
          face_registered: Boolean(employee.face_registered),
        }
      : null,
  };
}

async function resolveLoginEmail(identifier) {
  const value = String(identifier || '').trim();
  if (!value) throw new HttpError(400, 'NIP atau email wajib diisi.');
  if (value.includes('@')) return value.toLowerCase();

  const { data, error } = await db
    .from('employees')
    .select('nip, email')
    .ilike('nip', value)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.email) {
    throw new HttpError(401, 'NIP atau email tidak ditemukan.');
  }
  return String(data.email).toLowerCase();
}

async function signIn(identifier, password) {
  if (!password) throw new HttpError(400, 'Password wajib diisi.');

  const email = await resolveLoginEmail(identifier);
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data?.session) {
    const message = /invalid login credentials/i.test(error?.message || '')
      ? 'Email/NIP atau password salah.'
      : error?.message || 'Login gagal.';
    throw new HttpError(401, message);
  }

  const context = await loadUserContext(data.user.id);
  if (!context.profile) {
    await authClient.auth.signOut();
    throw forbidden('Akun ini belum memiliki profil. Hubungi admin.');
  }

  return {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user: serializeUser(context),
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NIP_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;

function isDuplicate(error) {
  return error?.code === '23505' || /duplicate key|already exists|already been registered/i.test(error?.message || '');
}

/**
 * Registrasi mandiri karyawan.
 * Membuat auth user (service role), data karyawan, lalu profil dengan role karyawan.
 * Kalau salah satu langkah gagal, semua yang sudah dibuat dihapus lagi.
 */
async function register(input = {}) {
  const nip = String(input.nip || '').trim();
  const nama = String(input.nama || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const departemen = String(input.departemen || '').trim() || null;
  const password = String(input.password || '');

  if (!nama) throw new HttpError(400, 'Nama lengkap wajib diisi.');
  if (!nip) throw new HttpError(400, 'NIP wajib diisi.');
  if (!NIP_PATTERN.test(nip)) {
    throw new HttpError(400, 'NIP hanya boleh huruf, angka, titik, garis bawah, atau strip (3-32 karakter).');
  }
  if (!EMAIL_PATTERN.test(email)) throw new HttpError(400, 'Format email tidak valid.');
  if (password.length < 6) throw new HttpError(400, 'Password minimal 6 karakter.');

  const { data: nipOwner, error: nipError } = await db
    .from('employees')
    .select('id')
    .ilike('nip', nip)
    .limit(1)
    .maybeSingle();
  if (nipError) throw nipError;
  if (nipOwner) throw new HttpError(409, 'NIP sudah terdaftar. Gunakan NIP lain atau hubungi admin.');

  const { data: emailOwner, error: emailError } = await db
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  if (emailError) throw emailError;
  if (emailOwner) throw new HttpError(409, 'Email sudah terdaftar. Silakan login.');

  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nama, nip },
  });

  if (created.error) {
    if (isDuplicate(created.error)) throw new HttpError(409, 'Email sudah terdaftar. Silakan login.');
    throw created.error;
  }

  const userId = created.data.user.id;
  let employeeId = null;

  try {
    const employee = await db
      .from('employees')
      .insert({ nip, nama, departemen, email })
      .select('id')
      .single();

    if (employee.error) {
      if (isDuplicate(employee.error)) {
        throw new HttpError(409, 'NIP sudah terdaftar. Gunakan NIP lain atau hubungi admin.');
      }
      throw employee.error;
    }
    employeeId = employee.data.id;

    const profile = await db.from('profiles').upsert(
      { id: userId, email, role: 'karyawan', employee_id: employeeId, nama },
      { onConflict: 'id' }
    );
    if (profile.error) throw profile.error;
  } catch (error) {
    // Rollback supaya tidak ada akun/auth user menggantung tanpa profil.
    if (employeeId) await db.from('employees').delete().eq('id', employeeId);
    await db.from('profiles').delete().eq('id', userId);
    await db.auth.admin.deleteUser(userId).catch(() => undefined);
    throw error;
  }

  const context = await loadUserContext(userId);
  return { user: serializeUser(context) };
}

async function refreshSession(refreshToken) {
  if (!refreshToken) throw new HttpError(400, 'Refresh token wajib diisi.');
  const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) {
    throw unauthorized('Sesi sudah berakhir. Silakan login kembali.');
  }
  return {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
  };
}

async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorized();

    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user) throw unauthorized();

    const context = await loadUserContext(data.user.id);
    if (!context.profile) throw forbidden('Akun ini belum memiliki profil. Hubungi admin.');

    req.token = token;
    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: normalizeRole(context.profile.role),
      profile: context.profile,
      employee: context.employee,
    };
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') {
    next(forbidden('Fitur ini hanya untuk admin.'));
    return;
  }
  next();
}

async function changePassword(user, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) {
    throw new HttpError(400, 'Password lama dan password baru wajib diisi.');
  }
  if (String(newPassword).length < 6) {
    throw new HttpError(400, 'Password baru minimal 6 karakter.');
  }

  const { error: verifyError } = await authClient.auth.signInWithPassword({
    email: user.email,
    password: oldPassword,
  });
  if (verifyError) throw new HttpError(400, 'Password lama salah.');

  const { error } = await db.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) throw error;
}

module.exports = {
  register,
  signIn,
  refreshSession,
  requireAuth,
  requireAdmin,
  serializeUser,
  changePassword,
  normalizeRole,
  loadUserContext,
  config,
};
