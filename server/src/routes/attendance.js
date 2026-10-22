'use strict';

const express = require('express');
const config = require('../config');
const { db } = require('../supabase');
const { requireAuth } = require('../auth');
const { evaluateLocation } = require('../geo');
const { dateKey, hariName, timeKey, minutesBetween, formatDuration, monthRange } = require('../time');
const { decorateRecord, summarize } = require('../attendance-utils');
const { uploadAttendancePhoto, attendancePhotoMap, attachPhotos } = require('../photos');
const { HttpError, conflict } = require('../errors');

const router = express.Router();
router.use(requireAuth);

function employeeId(req) {
  const id = req.user.employee?.id;
  if (!id) {
    throw conflict('Akun ini belum terhubung ke data karyawan. Hubungi admin.');
  }
  return id;
}

async function findToday(employeeIdValue, date = dateKey()) {
  const { data, error } = await db
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeIdValue)
    .eq('tanggal', date)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function assertLocationAllowed(location) {
  if (config.requireLocation && !location.hasLocation) {
    throw new HttpError(422, 'Lokasi GPS tidak tersedia. Aktifkan izin lokasi lalu coba lagi.');
  }

  if (!config.enforceGeofence || !location.hasLocation) return;

  // GPS dengan akurasi buruk (>100 m) bisa menolak karyawan yang sebenarnya
  // sudah di kantor, jadi minta pengguna menunggu sinyal membaik.
  if (location.accuracy !== null && location.accuracy > config.maxAccuracyM) {
    throw new HttpError(
      422,
      `Akurasi GPS terlalu rendah (±${location.accuracy} m). Tunggu beberapa saat di area terbuka, lalu coba lagi.`,
      {
        accuracy: location.accuracy,
        maxAccuracyM: config.maxAccuracyM,
      }
    );
  }

  if (!location.inside) {
    throw new HttpError(
      422,
      `Anda berada ${location.distanceM} m dari ${config.office.name}. Radius absensi ${config.office.radiusM} m.`,
      {
        distanceM: location.distanceM,
        radiusM: config.office.radiusM,
        toleranceM: location.toleranceM,
        office: config.office,
      }
    );
  }
}

/**
 * Foto opsional: kalau dikirim, unggah ke storage dan kembalikan URL publiknya.
 * `REQUIRE_PHOTO=true` membuat absensi tanpa foto ditolak.
 */
async function savePhoto(req, { employeeId: employeeIdValue, date, type }) {
  const photo = req.body?.photo;

  if (!photo) {
    if (config.requirePhoto) {
      throw new HttpError(422, 'Foto wajib diambil sebelum absensi.');
    }
    return null;
  }

  return uploadAttendancePhoto({
    employeeId: employeeIdValue,
    date,
    type,
    photo,
  });
}

function locationFields(location, prefix) {
  return {
    [`${prefix}_lat`]: location.lat,
    [`${prefix}_long`]: location.lng,
    [`${prefix}_address`]: location.address,
  };
}

router.get('/today', async (req, res) => {
  const id = employeeId(req);
  const date = dateKey();
  const record = await findToday(id, date);
  const photoMap = await attendancePhotoMap(id);

  res.json({
    date,
    hari: hariName(),
    server_time: new Date().toISOString(),
    time: timeKey(),
    office: config.office,
    record: attachPhotos(decorateRecord(record), photoMap),
  });
});

router.get('/', async (req, res) => {
  const id = employeeId(req);
  const nowMonth = dateKey().slice(0, 7);
  const { start, end } = monthRange(req.query.month || nowMonth);

  const { data, error } = await db
    .from('attendance')
    .select('*')
    .eq('employee_id', id)
    .gte('tanggal', start)
    .lte('tanggal', end)
    .order('tanggal', { ascending: false })
    .order('check_in_at', { ascending: false })
    .limit(366);

  if (error) throw error;

  const photoMap = await attendancePhotoMap(id);
  const records = (data || []).map((row) => attachPhotos(decorateRecord(row), photoMap));
  res.json({
    month: start.slice(0, 7),
    start,
    end,
    records,
    summary: summarize(data || []),
  });
});

router.post('/check-in', async (req, res) => {
  const id = employeeId(req);
  const { isMocked } = req.body || {};
  // Anti-fake location: tolak jika GPS diekspolasi/mock
  if (isMocked) {
    throw new HttpError(
      403,
      'Akses ditolak: Lokasi terdeteksi sebagai pengaksesan mock GPS atau VPN.'
    );
  }
  const location = await evaluateLocation(req.body || {});
  assertLocationAllowed(location);

  const date = dateKey();
  const existing = await findToday(id, date);
  if (existing?.check_in_at) {
    throw conflict('Anda sudah absen masuk hari ini.');
  }

  const photoUrl = await savePhoto(req, { employeeId: id, date, type: 'in' });

  const payload = {
    employee_id: id,
    tanggal: date,
    hari: hariName(),
    check_in_at: new Date().toISOString(),
    ...locationFields(location, 'check_in'),
    lokasi_tidak_tersedia: !location.hasLocation || !location.available,
  };

  const { data, error } = await db.from('attendance').insert(payload).select('*').single();
  if (error) throw error;

  res.status(201).json({
    message: photoUrl ? 'Absen masuk berhasil dengan foto.' : 'Absen masuk berhasil.',
    record: {
      ...decorateRecord(data),
      check_in_photo: photoUrl,
      check_out_photo: null,
    },
    photo: photoUrl,
    location: {
      distanceM: location.distanceM,
      inside: location.inside,
      address: location.address,
      accuracy: location.accuracy,
      toleranceM: location.toleranceM,
    },
  });
});

router.post('/check-out', async (req, res) => {
  const id = employeeId(req);
  const { isMocked } = req.body || {};
  // Anti-fake location: tolak jika GPS diekspolasi/mock
  if (isMocked) {
    throw new HttpError(
      403,
      'Akses ditolak: Lokasi terdeteksi sebagai pengaksesan mock GPS atau VPN.'
    );
  }
  const location = await evaluateLocation(req.body || {});
  assertLocationAllowed(location);

  const date = dateKey();
  const existing = await findToday(id, date);
  if (!existing?.check_in_at) {
    throw conflict('Anda belum absen masuk hari ini.');
  }
  if (existing.check_out_at) {
    throw conflict('Anda sudah absen pulang hari ini.');
  }

  const now = new Date().toISOString();
  const minutes = minutesBetween(existing.check_in_at, now);
  const update = {
    check_out_at: now,
    ...locationFields(location, 'check_out'),
    work_duration: formatDuration(minutes),
    lokasi_tidak_tersedia:
      Boolean(existing.lokasi_tidak_tersedia) || !location.hasLocation || !location.available,
  };

  const photoUrl = await savePhoto(req, { employeeId: id, date, type: 'out' });

  const { data, error } = await db
    .from('attendance')
    .update(update)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) throw error;

  const photoMap = await attendancePhotoMap(id);

  res.json({
    message: photoUrl ? 'Absen pulang berhasil dengan foto.' : 'Absen pulang berhasil.',
    record: attachPhotos(decorateRecord(data), photoMap),
    photo: photoUrl,
    location: {
      distanceM: location.distanceM,
      inside: location.inside,
      address: location.address,
      accuracy: location.accuracy,
      toleranceM: location.toleranceM,
    },
  });
});

module.exports = router;
