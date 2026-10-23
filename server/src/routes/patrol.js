'use strict';

const express = require('express');
const config = require('../config');
const { db } = require('../supabase');
const { requireAuth } = require('../auth');
const { dateKey, hariName, serverNow } = require('../time');
const { haversineMeters, isMocked, parseCoord } = require('../geo');
const {
  FaceError,
  decodeDataUrl,
  detectFace,
  euclideanDistance,
  parseVector,
} = require('../lib/face');
const { HttpError, conflict } = require('../errors');

const router = express.Router();
router.use(requireAuth);

function employeeId(req) {
  const id = req.user.employee?.id;
  if (!id) throw conflict('Akun ini belum terhubung ke data karyawan. Hubungi admin.');
  return id;
}

function faceHttpError(error) {
  if (error instanceof FaceError) {
    return new HttpError(error.statusCode || 422, error.message, {
      code: error.code,
      ...(error.details || {}),
    });
  }
  return new HttpError(500, 'Gagal memproses foto wajah.');
}

async function loadCheckpoints() {
  const { data, error } = await db
    .from('patrol_checkpoints')
    .select('id, nama, lat, lng, radius_meter, urutan, aktif')
    .eq('aktif', true)
    .order('urutan', { ascending: true });
  if (error) throw error;
  return data || [];
}

function checkpointMap(checkpoints) {
  return new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
}

function attachCheckpoint(log, map) {
  const checkpoint = map.get(log.titik_id) || null;
  return {
    ...log,
    checkpoint: checkpoint
      ? {
          id: checkpoint.id,
          nama: checkpoint.nama,
          urutan: checkpoint.urutan,
          radius_meter: checkpoint.radius_meter,
          lat: checkpoint.lat,
          lng: checkpoint.lng,
        }
      : null,
  };
}

function progressOf(checkpoints, logs) {
  const total = checkpoints.length;
  const scanned = new Set((logs || []).map((log) => log.titik_id)).size;
  const percent = total > 0 ? Math.round((scanned / total) * 100) : 0;
  return { scanned, total, percent, done: total > 0 && scanned >= total };
}

/**
 * GET /api/patrol/today
 * Semua titik aktif + status scan hari ini (dari waktu server).
 */
router.get('/today', async (req, res) => {
  const id = employeeId(req);
  const now = await serverNow();
  const date = dateKey(now);
  const checkpoints = await loadCheckpoints();

  const { data: logs, error } = await db
    .from('patrol_logs')
    .select('*')
    .eq('user_id', id)
    .eq('tanggal', date)
    .order('timestamp_server', { ascending: true });
  if (error) throw error;

  const scannedAt = new Map((logs || []).map((log) => [log.titik_id, log.timestamp_server]));
  const map = checkpointMap(checkpoints);

  res.json({
    date,
    hari: hariName(now),
    server_time: now.toISOString(),
    checkpoints: checkpoints.map((checkpoint) => ({
      ...checkpoint,
      scanned_at: scannedAt.get(checkpoint.id) || null,
      scanned: scannedAt.has(checkpoint.id),
    })),
    progress: progressOf(checkpoints, logs),
    logs: (logs || []).map((log) => attachCheckpoint(log, map)),
  });
});

/**
 * POST /api/patrol/scan
 * Geofence titik + selfie face match cepat (tanpa liveness, sesuai P6)
 * lalu insert patrol_logs. Satu titik hanya sekali per hari.
 */
router.post('/scan', async (req, res) => {
  const id = employeeId(req);

  if (isMocked(req.body || {})) {
    throw new HttpError(422, 'Lokasi palsu (mock GPS) terdeteksi.', {
      code: 'MOCK_LOCATION',
    });
  }

  const lat = parseCoord(req.body?.lat);
  const lng = parseCoord(req.body?.lng);
  const accuracy = parseCoord(req.body?.accuracy);
  const checkpointId = String(req.body?.checkpoint_id || '').trim();

  if (!checkpointId) {
    throw new HttpError(400, 'Titik patroli wajib dipilih.', { code: 'CHECKPOINT_REQUIRED' });
  }
  if (lat === null || lng === null) {
    throw new HttpError(422, 'Lokasi GPS wajib aktif untuk scan titik.', {
      code: 'LOCATION_REQUIRED',
    });
  }
  if (accuracy === null || accuracy > config.maxAccuracyM) {
    throw new HttpError(
      422,
      `Akurasi GPS ${accuracy === null ? 'tidak terbaca' : `±${accuracy} m`}. Tunggu sampai akurasi ≤ ${config.maxAccuracyM} m.`,
      { code: 'LOCATION_ACCURACY', accuracy, maxAccuracyM: config.maxAccuracyM }
    );
  }

  const { data: checkpoint, error: checkpointError } = await db
    .from('patrol_checkpoints')
    .select('*')
    .eq('id', checkpointId)
    .eq('aktif', true)
    .maybeSingle();
  if (checkpointError) throw checkpointError;
  if (!checkpoint) {
    throw new HttpError(404, 'Titik patroli tidak ditemukan atau sudah nonaktif.', {
      code: 'CHECKPOINT_NOT_FOUND',
    });
  }

  const distanceM = haversineMeters(lat, lng, checkpoint.lat, checkpoint.lng);
  const tolerance = Math.min(accuracy, Math.max(0, config.geofenceAccuracyMarginM));
  if (distanceM > checkpoint.radius_meter + tolerance) {
    throw new HttpError(
      422,
      `Kamu berada ${distanceM} m dari ${checkpoint.nama}. Radius scan ${checkpoint.radius_meter} m.`,
      {
        code: 'OUTSIDE_CHECKPOINT',
        distanceM,
        radiusM: checkpoint.radius_meter,
        toleranceM: Math.round(tolerance),
      }
    );
  }

  // Wajah harus cocok dengan embedding terdaftar (selfie cepat).
  const { data: employee, error: employeeError } = await db
    .from('employees')
    .select('face_registered, nip, nama')
    .eq('id', id)
    .maybeSingle();
  if (employeeError) throw employeeError;
  if (!employee?.face_registered) {
    throw new HttpError(403, 'Registrasi wajah dulu sebelum scan patroli.', {
      code: 'FACE_NOT_REGISTERED',
    });
  }

  const { data: faceRow, error: faceError } = await db
    .from('employee_faces')
    .select('embedding')
    .eq('employee_id', id)
    .maybeSingle();
  if (faceError) throw faceError;
  if (!faceRow?.embedding) {
    throw new HttpError(403, 'Data wajah belum tersedia. Registrasi ulang.', {
      code: 'FACE_NOT_REGISTERED',
    });
  }

  const photo = req.body?.photo;
  if (!photo) {
    throw new HttpError(400, 'Selfie wajib diambil untuk scan titik.', {
      code: 'FACE_PHOTO_REQUIRED',
    });
  }

  let probe;
  try {
    probe = await detectFace(decodeDataUrl(photo), {
      descriptors: true,
      requireSingle: true,
    });
  } catch (error) {
    throw faceHttpError(error);
  }

  const stored = parseVector(faceRow.embedding);
  const faceDistance = euclideanDistance(probe.descriptor, stored);
  if (!(faceDistance < config.faceVerifyThreshold)) {
    throw new HttpError(422, 'Wajah tidak cocok dengan data terdaftar. Coba lagi.', {
      code: 'FACE_NOT_MATCH',
      distance: Number(faceDistance.toFixed(4)),
      threshold: config.faceVerifyThreshold,
    });
  }

  const now = await serverNow();
  const date = dateKey(now);

  const { data: log, error: insertError } = await db
    .from('patrol_logs')
    .insert({
      user_id: id,
      titik_id: checkpoint.id,
      tanggal: date,
      timestamp_server: now.toISOString(),
      lat,
      lng,
    })
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      throw conflict(`${checkpoint.nama} sudah discan hari ini.`);
    }
    throw insertError;
  }

  const checkpoints = await loadCheckpoints();
  const { data: logs, error: logsError } = await db
    .from('patrol_logs')
    .select('*')
    .eq('user_id', id)
    .eq('tanggal', date);
  if (logsError) throw logsError;

  const progress = progressOf(checkpoints, logs);
  res.status(201).json({
    message: progress.done
      ? 'Patroli selesai! Semua titik sudah discan hari ini.'
      : `${checkpoint.nama} berhasil discan.`,
    log: attachCheckpoint(log, checkpointMap(checkpoints)),
    progress,
    face_distance: Number(faceDistance.toFixed(4)),
  });
});

/**
 * GET /api/patrol/history
 * Riwayat patroli per tanggal (default 30 hari terakhir).
 */
router.get('/history', async (req, res) => {
  const id = employeeId(req);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));

  const { data: logs, error } = await db
    .from('patrol_logs')
    .select('*')
    .eq('user_id', id)
    .order('tanggal', { ascending: false })
    .order('timestamp_server', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const checkpoints = await loadCheckpoints();
  const map = checkpointMap(checkpoints);
  const days = new Map();

  for (const log of logs || []) {
    const key = String(log.tanggal || '');
    if (!days.has(key)) {
      days.set(key, {
        tanggal: key,
        hari: hariName(new Date(`${key}T00:00:00+07:00`)),
        logs: [],
      });
    }
    days.get(key).logs.push(attachCheckpoint(log, map));
  }

  res.json({ days: Array.from(days.values()) });
});

module.exports = router;
