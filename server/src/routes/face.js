'use strict';

const express = require('express');
const config = require('../config');
const { db } = require('../supabase');
const { requireAuth } = require('../auth');
const { dateKey } = require('../time');
const { HttpError, conflict } = require('../errors');
const {
  FaceError,
  decodeDataUrl,
  detectFace,
  analyzeLiveness,
  meanDescriptor,
  euclideanDistance,
  toVectorLiteral,
  parseVector,
} = require('../lib/face');

const router = express.Router();
router.use(requireAuth);

const CHALLENGES = new Set(['blink_twice', 'close_eyes']);

function employeeId(req) {
  const id = req.user.employee?.id;
  if (!id) {
    throw conflict('Akun ini belum terhubung ke data karyawan. Hubungi admin.');
  }
  return id;
}

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

async function logAttempt({ employeeId: id, type, success, distance = null, reason = null, ip }) {
  try {
    const { error } = await db.from('face_attempt_logs').insert({
      employee_id: id,
      attempt_type: type,
      success,
      distance,
      reason,
      ip,
    });
    if (error) console.warn('[face] gagal mencatat attempt:', error.message);
  } catch (error) {
    console.warn('[face] gagal mencatat attempt:', error.message);
  }
}

function toHttpError(error, fallbackMessage) {
  if (error instanceof FaceError) {
    return new HttpError(error.statusCode || 422, error.message, {
      code: error.code,
      ...(error.details || {}),
    });
  }
  return new HttpError(500, fallbackMessage || 'Terjadi kesalahan saat memproses wajah.');
}

// ------------------------------------------------------------
// Rate limit verify: in-memory, cukup untuk demo.
// Production: pindahkan ke Redis supaya konsisten antar instance.
// ------------------------------------------------------------
const WINDOW_MS = 60_000;
const attempts = new Map();

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now - entry.first > WINDOW_MS) attempts.delete(key);
  }
}, WINDOW_MS);
cleanup.unref?.();

function rateLimitVerify(key) {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { first: now, count: 1 });
    return;
  }

  entry.count += 1;
  if (entry.count > config.faceVerifyPerMinute) {
    throw new HttpError(
      429,
      'Terlalu banyak percobaan verifikasi. Coba lagi 1 menit.',
      { code: 'RATE_LIMITED' }
    );
  }
}

async function livenessFailuresToday(employeeIdValue) {
  const { count, error } = await db
    .from('face_attempt_logs')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeIdValue)
    .eq('attempt_type', 'verify')
    .eq('success', false)
    .like('reason', 'LIVENESS_%')
    .gte('created_at', `${dateKey()}T00:00:00+07:00`);

  if (error) throw error;
  return count || 0;
}

// ------------------------------------------------------------
// GET /api/face/status
// ------------------------------------------------------------
router.get('/status', async (req, res) => {
  const id = employeeId(req);
  const { data, error } = await db
    .from('employees')
    .select('face_registered')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;

  res.json({ face_registered: Boolean(data?.face_registered) });
});

// ------------------------------------------------------------
// POST /api/face/enroll  { photos: [base64 x3] }
// ------------------------------------------------------------
router.post('/enroll', async (req, res) => {
  const id = employeeId(req);
  const ip = clientIp(req);
  const photos = Array.isArray(req.body?.photos) ? req.body.photos : [];

  if (photos.length !== 3) {
    throw new HttpError(422, 'Tiga foto wajah wajib dikirim (depan, kiri, kanan).', {
      code: 'PHOTO_COUNT',
    });
  }

  const descriptors = [];
  const quality = [];

  for (let index = 0; index < photos.length; index += 1) {
    let buffer;
    try {
      buffer = decodeDataUrl(photos[index]);
    } catch (error) {
      await logAttempt({
        employeeId: id,
        type: 'enroll',
        success: false,
        reason: `PAYLOAD_${index + 1}`,
        ip,
      });
      throw new HttpError(422, `Foto ke-${index + 1}: ${error.message}`, {
        code: error.code || 'BAD_PAYLOAD',
        index,
      });
    }

    try {
      const face = await detectFace(buffer, { descriptors: true, requireSingle: true });
      descriptors.push(face.descriptor);
      quality.push(face.quality);
    } catch (error) {
      await logAttempt({
        employeeId: id,
        type: 'enroll',
        success: false,
        reason: `${error.code || 'ERROR'}_${index + 1}`,
        ip,
      });
      const httpError = toHttpError(error, 'Gagal memproses foto wajah.');
      httpError.message = `Foto ke-${index + 1}: ${httpError.message}`;
      httpError.details = { ...(httpError.details || {}), index };
      throw httpError;
    }
  }

  const embedding = meanDescriptor(descriptors);

  // Cek duplikat: exact scan, euclidean.
  const { data: duplicateRows, error: duplicateError } = await db.rpc('match_employee_face', {
    query: toVectorLiteral(embedding),
    max_distance: config.faceDuplicateThreshold,
  });
  if (duplicateError) throw duplicateError;

  const duplicate = Array.isArray(duplicateRows) ? duplicateRows[0] : null;
  if (duplicate && duplicate.employee_id !== id) {
    await logAttempt({
      employeeId: id,
      type: 'enroll',
      success: false,
      distance: duplicate.dist,
      reason: `DUPLICATE_OF_${duplicate.employee_id}`,
      ip,
    });
    throw new HttpError(
      409,
      'Wajah ini sudah terdaftar pada akun lain. Hubungi admin untuk pengecekan.',
      { code: 'FACE_DUPLICATE' }
    );
  }

  const { error: upsertError } = await db.from('employee_faces').upsert(
    {
      employee_id: id,
      embedding: toVectorLiteral(embedding),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'employee_id' }
  );
  if (upsertError) throw upsertError;

  const { error: employeeError } = await db
    .from('employees')
    .update({ face_registered: true })
    .eq('id', id);
  if (employeeError) throw employeeError;

  await logAttempt({ employeeId: id, type: 'enroll', success: true, ip });

  res.status(201).json({
    ok: true,
    face_registered: true,
    quality,
  });
});

// ------------------------------------------------------------
// POST /api/face/verify  { frames: [base64...], challenge }
// Server menghitung EAR + descriptor sendiri; client tidak dipercaya.
// ------------------------------------------------------------
router.post('/verify', async (req, res) => {
  const id = employeeId(req);
  const ip = clientIp(req);

  rateLimitVerify(req.user.id);

  const frames = Array.isArray(req.body?.frames) ? req.body.frames : [];
  const challenge = String(req.body?.challenge || '');

  if (!CHALLENGES.has(challenge)) {
    throw new HttpError(422, 'Challenge liveness tidak dikenal.', { code: 'BAD_CHALLENGE' });
  }
  if (frames.length < 6 || frames.length > 30) {
    throw new HttpError(422, 'Jumlah frame liveness tidak valid.', { code: 'FRAME_COUNT' });
  }

  const blockedCount = await livenessFailuresToday(id);
  if (blockedCount >= config.faceMaxFailsPerDay) {
    throw new HttpError(
      403,
      'Verifikasi wajah gagal terlalu sering hari ini. Hubungi admin.',
      { code: 'FACE_BLOCKED', failures: blockedCount }
    );
  }

  const { data: employee, error: employeeError } = await db
    .from('employees')
    .select('face_registered')
    .eq('id', id)
    .maybeSingle();
  if (employeeError) throw employeeError;
  if (!employee?.face_registered) {
    throw new HttpError(403, 'Registrasi wajah dulu sebelum absen.', {
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
  const stored = parseVector(faceRow.embedding);

  const analyzed = [];
  for (const frame of frames) {
    try {
      const buffer = decodeDataUrl(frame, 1.5 * 1024 * 1024);
      const result = await detectFace(buffer, { descriptors: false, requireSingle: false });
      analyzed.push({ ear: result.ear, score: result.score });
    } catch {
      analyzed.push(null);
    }
  }

  const liveness = analyzeLiveness(analyzed, challenge);

  // Frame probe: yang terakhir dengan mata terbuka dan deteksi terbaik.
  let probeFrame = null;
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const meta = analyzed[index];
    if (meta && meta.ear >= 0.23) {
      probeFrame = { index, data: frames[index] };
      break;
    }
  }

  if (!probeFrame) {
    await logAttempt({
      employeeId: id,
      type: 'verify',
      success: false,
      reason: 'LIVENESS_NO_OPEN_FRAME',
      ip,
    });
    res.json({
      match: false,
      distance: null,
      threshold: config.faceVerifyThreshold,
      liveness: { ...liveness, passed: false, reason: 'NO_OPEN_FRAME' },
    });
    return;
  }

  let probe;
  try {
    probe = await detectFace(decodeDataUrl(probeFrame.data), {
      descriptors: true,
      requireSingle: true,
    });
  } catch (error) {
    await logAttempt({
      employeeId: id,
      type: 'verify',
      success: false,
      reason: `PROBE_${error.code || 'ERROR'}`,
      ip,
    });
    throw toHttpError(error, 'Gagal memverifikasi wajah.');
  }

  const distance = euclideanDistance(probe.descriptor, stored);
  const matched = distance < config.faceVerifyThreshold;

  if (!liveness.passed) {
    await logAttempt({
      employeeId: id,
      type: 'verify',
      success: false,
      distance,
      reason: `LIVENESS_${liveness.reason || 'FAILED'}`,
      ip,
    });

    const failures = (await livenessFailuresToday(id)) || 0;
    if (failures >= config.faceMaxFailsPerDay) {
      throw new HttpError(
        403,
        'Verifikasi wajah gagal terlalu sering hari ini. Hubungi admin.',
        { code: 'FACE_BLOCKED', failures }
      );
    }

    res.json({
      match: false,
      distance: Number(distance.toFixed(4)),
      threshold: config.faceVerifyThreshold,
      liveness,
      remaining_attempts: Math.max(0, config.faceMaxFailsPerDay - failures),
    });
    return;
  }

  if (!matched) {
    await logAttempt({
      employeeId: id,
      type: 'verify',
      success: false,
      distance,
      reason: `DISTANCE_${distance.toFixed(3)}`,
      ip,
    });

    res.json({
      match: false,
      distance: Number(distance.toFixed(4)),
      threshold: config.faceVerifyThreshold,
      liveness,
    });
    return;
  }

  const { data: verification, error: verificationError } = await db
    .from('face_verifications')
    .insert({
      employee_id: id,
      distance,
      liveness_passed: true,
    })
    .select('id, expires_at')
    .single();
  if (verificationError) throw verificationError;

  await logAttempt({
    employeeId: id,
    type: 'verify',
    success: true,
    distance,
    ip,
  });

  res.json({
    match: true,
    verification_id: verification.id,
    expires_at: verification.expires_at,
    distance: Number(distance.toFixed(4)),
    threshold: config.faceVerifyThreshold,
    liveness,
  });
});

module.exports = router;
