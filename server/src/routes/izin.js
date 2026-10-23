'use strict';

const express = require('express');
const { db } = require('../supabase');
const { requireAuth } = require('../auth');
const { dateKey, hariName, monthRange, serverNow } = require('../time');
const { uploadIzinPhotoSafe } = require('../photos');
const { HttpError, conflict } = require('../errors');

const router = express.Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ALASAN = 1000;

function employeeId(req) {
  const id = req.user.employee?.id;
  if (!id) {
    throw conflict('Akun ini belum terhubung ke data karyawan. Hubungi admin.');
  }
  return id;
}

function parseDate(value) {
  const text = String(value || '').trim();
  if (!DATE_RE.test(text)) {
    throw new HttpError(400, 'Tanggal izin wajib diisi (format YYYY-MM-DD).', {
      code: 'IZIN_DATE_REQUIRED',
    });
  }
  const parsed = new Date(`${text}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== text) {
    throw new HttpError(400, 'Tanggal izin tidak valid.', { code: 'IZIN_DATE_INVALID' });
  }
  return text;
}

/**
 * GET /api/izin
 * Daftar izin milik sendiri, terbaru di atas. Bisa difilter bulan (YYYY-MM).
 */
router.get('/', async (req, res) => {
  const id = employeeId(req);
  const month = String(req.query.month || '').trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));

  let query = db
    .from('izin')
    .select('id, tanggal, alasan, foto_url, status, catatan, reviewed_at, created_at')
    .eq('user_id', id)
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new HttpError(400, 'Filter bulan tidak valid (format YYYY-MM).');
    }
    const range = monthRange(month);
    query = query.gte('tanggal', range.start).lte('tanggal', range.end);
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = (data || []).map((item) => ({
    ...item,
    hari: hariName(new Date(`${item.tanggal}T00:00:00+07:00`)),
  }));

  const counts = items.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 }
  );

  res.json({ items, counts, month: month || null });
});

/**
 * POST /api/izin
 * Ajukan izin: tanggal + alasan + foto pendukung opsional.
 * Status selalu `pending` (approval dilakukan atasan, di luar P7).
 */
router.post('/', async (req, res) => {
  const id = employeeId(req);
  const tanggal = parseDate(req.body?.tanggal);

  const alasan = String(req.body?.alasan || '').trim();
  if (alasan.length < 3) {
    throw new HttpError(400, 'Alasan izin minimal 3 karakter.', {
      code: 'IZIN_REASON_REQUIRED',
    });
  }
  if (alasan.length > MAX_ALASAN) {
    throw new HttpError(400, `Alasan izin maksimal ${MAX_ALASAN} karakter.`, {
      code: 'IZIN_REASON_TOO_LONG',
    });
  }

  // Cegah pengajuan ganda untuk tanggal yang sama selama masih menunggu.
  const { data: existing, error: existingError } = await db
    .from('izin')
    .select('id, status')
    .eq('user_id', id)
    .eq('tanggal', tanggal)
    .eq('status', 'pending')
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    throw conflict('Sudah ada pengajuan izin yang menunggu persetujuan untuk tanggal tersebut.');
  }

  const { data: employee, error: employeeError } = await db
    .from('employees')
    .select('nip, nama')
    .eq('id', id)
    .maybeSingle();
  if (employeeError) throw employeeError;

  const now = await serverNow();
  let fotoUrl = null;
  let fotoError = null;

  if (req.body?.photo) {
    const uploaded = await uploadIzinPhotoSafe({
      employeeId: id,
      photo: req.body.photo,
      watermark: {
        nip: employee?.nip,
        nama: employee?.nama,
        serverTime: now.toISOString(),
        locationName: 'Foto pendukung izin',
      },
    });
    fotoUrl = uploaded.url;
    fotoError = uploaded.error;
  }

  const { data: item, error } = await db
    .from('izin')
    .insert({
      user_id: id,
      tanggal,
      alasan,
      foto_url: fotoUrl,
      status: 'pending',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select('id, tanggal, alasan, foto_url, status, catatan, reviewed_at, created_at')
    .single();
  if (error) throw error;

  res.status(201).json({
    message: 'Pengajuan izin terkirim. Menunggu persetujuan atasan.',
    item: { ...item, hari: hariName(new Date(`${item.tanggal}T00:00:00+07:00`)) },
    // Foto bersifat pelengkap: izin tetap tersimpan walau unggahan gagal.
    photo_warning: fotoError || undefined,
  });
});

module.exports = router;
