'use strict';

const express = require('express');
const config = require('../config');
const { db } = require('../supabase');
const { requireAuth } = require('../auth');
const { evaluateLocation } = require('../geo');
const { dateKey, hariName, timeKey, minutesBetween, formatDuration, monthRange } = require('../time');
const { decorateRecord, summarize } = require('../attendance-utils');
const {
  assertPhoto,
  uploadAttendancePhotoSafe,
  attendancePhotoMap,
  attachPhotos,
} = require('../photos');
const { HttpError, conflict } = require('../errors');

const router = express.Router();
router.use(requireAuth);

const OPEN_SHIFT_HOURS = 18;

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

/**
 * Cari shift yang belum ditutup (untuk absen pulang lewat tengah malam).
 * Tanpa ini, absen masuk 23:00 dan pulang 07:00 selalu gagal.
 */
async function findOpenShift(employeeIdValue) {
  const since = new Date(Date.now() - OPEN_SHIFT_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeIdValue)
    .is('check_out_at', null)
    .gte('check_in_at', since)
    .order('check_in_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function assertLocationAllowed(location) {
  // Lokasi wajib. Klien tetap tidak dipercaya soal koordinat, tapi minimal
  // tidak ada lagi jalan pintas "absen tanpa lokasi" seperti di audit.
  if (!location.hasLocation) {
    throw new HttpError(422, 'Lokasi GPS wajib aktif untuk absensi.', {
      code: 'LOCATION_REQUIRED',
    });
  }

  if (location.accuracy === null || location.accuracy > config.maxAccuracyM) {
    throw new HttpError(
      422,
      `Akurasi GPS tidak valid${location.accuracy === null ? '' : ` (±${location.accuracy} m)`}. Tunggu sinyal membaik lalu coba lagi.`,
      { code: 'LOCATION_ACCURACY', accuracy: location.accuracy, maxAccuracyM: config.maxAccuracyM }
    );
  }

  if (!config.enforceGeofence) return;

  if (!location.inside) {
    throw new HttpError(
      422,
      `Anda berada ${location.distanceM} m dari ${config.office.name}. Radius absensi ${config.office.radiusM} m.`,
      {
        code: 'OUTSIDE_GEOFENCE',
        distanceM: location.distanceM,
        radiusM: config.office.radiusM,
        toleranceM: location.toleranceM,
        office: config.office,
      }
    );
  }
}

/**
 * Validasi payload foto SEBELUM menulis attendance, supaya foto rusak
 * ditolak lebih awal tapi upload yang gagal tidak membatalkan absensi.
 */
function requirePhotoPayload(req) {
  const photo = req.body?.photo;

  if (!photo) {
    if (config.requirePhoto) {
      throw new HttpError(422, 'Foto wajib diambil sebelum absensi.', {
        code: 'PHOTO_REQUIRED',
      });
    }
    return null;
  }

  assertPhoto(photo);
  return photo;
}

/**
 * Ambil bukti verifikasi wajah sekali pakai.
 * Distance dibaca dari database, BUKAN dari body request.
 */
async function consumeVerification(req, employeeIdValue) {
  const verificationId = String(req.body?.verification_id || '').trim();
  if (!verificationId) {
    throw new HttpError(400, 'Verifikasi wajah wajib dilakukan sebelum absen.', {
      code: 'FACE_VERIFICATION_REQUIRED',
    });
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from('face_verifications')
    .update({ used_at: now })
    .eq('id', verificationId)
    .eq('employee_id', employeeIdValue)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('distance, liveness_passed')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new HttpError(
      400,
      'Verifikasi wajah tidak valid atau sudah kedaluwarsa. Ulangi verifikasi.',
      { code: 'FACE_VERIFICATION_INVALID' }
    );
  }
  if (!data.liveness_passed || Number(data.distance) >= config.faceVerifyThreshold) {
    throw new HttpError(400, 'Verifikasi wajah tidak lolos. Ulangi verifikasi.', {
      code: 'FACE_VERIFICATION_INVALID',
    });
  }

  return { id: verificationId, distance: Number(data.distance) };
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

  // Catatan: deteksi mock location tidak bisa dipercaya dari body (boolean
  // client). Kalau butuh kontrol nyata, pakai Play Integrity / App Attest.
  const location = await evaluateLocation(req.body || {});
  assertLocationAllowed(location);

  const date = dateKey();
  const existing = await findToday(id, date);
  if (existing?.check_in_at) {
    throw conflict('Anda sudah absen masuk hari ini.');
  }

  // Validasi foto dulu (tanpa menulis apa pun), lalu verifikasi wajah.
  const photo = requirePhotoPayload(req);
  const verification = await consumeVerification(req, id);

  const payload = {
    employee_id: id,
    tanggal: date,
    hari: hariName(),
    check_in_at: new Date().toISOString(),
    ...locationFields(location, 'check_in'),
    lokasi_tidak_tersedia: false,
    face_match: verification.distance,
    face_verified: true,
    liveness_passed: true,
    face_verification_id: verification.id,
    needs_photo: !photo,
  };

  const { data, error } = await db.from('attendance').insert(payload).select('*').single();
  if (error) {
    if (error.code === '23505') throw conflict('Anda sudah absen masuk hari ini.');
    throw error;
  }

  let photoUrl = null;
  let photoError = null;
  if (photo) {
    const uploaded = await uploadAttendancePhotoSafe({
      employeeId: id,
      date,
      type: 'in',
      photo,
    });
    photoUrl = uploaded.url;
    photoError = uploaded.error;

    if (!photoUrl) {
      await db.from('attendance').update({ needs_photo: true }).eq('id', data.id);
      data.needs_photo = true;
    }
  }

  res.status(201).json({
    message: photoError
      ? 'Absen masuk tercatat. Foto gagal diunggah dan akan ditandai untuk diunggah ulang.'
      : 'Absen masuk berhasil.',
    record: {
      ...decorateRecord(data),
      check_in_photo: photoUrl,
      check_out_photo: null,
    },
    photo: photoUrl,
    photo_error: photoError,
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

  const location = await evaluateLocation(req.body || {});
  assertLocationAllowed(location);

  const date = dateKey();
  const existing = (await findToday(id, date)) || (await findOpenShift(id));

  if (!existing?.check_in_at) {
    throw conflict('Anda belum absen masuk.');
  }
  if (existing.check_out_at) {
    throw conflict('Anda sudah absen pulang untuk shift ini.');
  }

  const photo = requirePhotoPayload(req);
  const verification = await consumeVerification(req, id);

  const now = new Date().toISOString();
  const minutes = minutesBetween(existing.check_in_at, now);
  const update = {
    check_out_at: now,
    ...locationFields(location, 'check_out'),
    work_duration: formatDuration(minutes),
    lokasi_tidak_tersedia: false,
    face_match: verification.distance,
    face_verified: true,
    liveness_passed: true,
    face_verification_id: verification.id,
  };

  const { data, error } = await db
    .from('attendance')
    .update(update)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) throw error;

  let photoUrl = null;
  let photoError = null;
  if (photo) {
    const uploaded = await uploadAttendancePhotoSafe({
      employeeId: id,
      // Simpan pada tanggal absen masuk supaya shift malam tetap satu folder.
      date: existing.tanggal,
      type: 'out',
      photo,
    });
    photoUrl = uploaded.url;
    photoError = uploaded.error;

    if (!photoUrl) {
      await db.from('attendance').update({ needs_photo: true }).eq('id', data.id);
      data.needs_photo = true;
    }
  }

  const photoMap = await attendancePhotoMap(id);

  res.json({
    message: photoError
      ? 'Absen pulang tercatat. Foto gagal diunggah dan akan ditandai untuk diunggah ulang.'
      : 'Absen pulang berhasil.',
    record: attachPhotos(decorateRecord(data), photoMap),
    photo: photoUrl,
    photo_error: photoError,
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
