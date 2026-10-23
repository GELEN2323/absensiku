'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const config = {
  port: num(process.env.PORT, 4000),
  isProduction: process.env.NODE_ENV === 'production',

  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  passwordResetRedirectUrl: process.env.PASSWORD_RESET_REDIRECT_URL || '',

  webOrigins: (process.env.WEB_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  office: {
    name: process.env.OFFICE_NAME || 'Kantor Pusat',
    lat: num(process.env.OFFICE_LAT, -7.988931),
    lng: num(process.env.OFFICE_LNG, 112.627671),
    radiusM: num(process.env.OFFICE_RADIUS_M, 150),
  },

  requireLocation: bool(process.env.REQUIRE_LOCATION, false),
  enforceGeofence: bool(process.env.ENFORCE_GEOFENCE, true),
  requirePhoto: bool(process.env.REQUIRE_PHOTO, false),
  maxPhotoMb: num(process.env.MAX_PHOTO_MB, 3),
  // Body JSON untuk endpoint yang membawa foto (absensi/patroli/izin).
  // Base64 ~33% lebih besar dari file asli, jadi beri ruang di atas MAX_PHOTO_MB.
  photoBodyLimit: process.env.PHOTO_BODY_LIMIT || '8mb',
  // P4: akurasi GPS lebih buruk dari 50 m -> minta pengguna menunggu.
  maxAccuracyM: num(process.env.MAX_ACCURACY_M, 50),
  geofenceAccuracyMarginM: num(process.env.GEOFENCE_ACCURACY_MARGIN_M, 25),
  workStart: process.env.WORK_START || '08:00',
  workEnd: process.env.WORK_END || '17:00',
  lateToleranceMin: num(process.env.LATE_TOLERANCE_MIN, 0),
  geocodeEnabled: bool(process.env.GEOCODE_ENABLED, true),

  // Face recognition (lihat server/src/lib/face.js)
  // Threshold EUCLIDEAN, bukan cosine. Kalibrasi ulang dengan data asli.
  faceVerifyThreshold: num(process.env.FACE_VERIFY_THRESHOLD, 0.45),
  faceDuplicateThreshold: num(process.env.FACE_DUPLICATE_THRESHOLD, 0.35),
  faceMaxFailsPerDay: num(process.env.FACE_MAX_FAILS_PER_DAY, 3),
  faceVerifyPerMinute: num(process.env.FACE_VERIFY_PER_MINUTE, 5),
  faceMinBrightness: num(process.env.FACE_MIN_BRIGHTNESS, 45),
  faceMaxBrightness: num(process.env.FACE_MAX_BRIGHTNESS, 215),
  faceMinSharpness: num(process.env.FACE_MIN_SHARPNESS, 15),
  faceMinContrast: num(process.env.FACE_MIN_CONTRAST, 18),
  faceMinBoxPx: num(process.env.FACE_MIN_BOX_PX, 80),
  faceDetectorInputSize: num(process.env.FACE_DETECTOR_INPUT_SIZE, 416),
  faceDetectorScore: num(process.env.FACE_DETECTOR_SCORE, 0.4),
  faceMinDetectedFrames: num(process.env.FACE_MIN_DETECTED_FRAMES, 6),
  faceMinClosedFrames: num(process.env.FACE_MIN_CLOSED_FRAMES, 2),
  faceMaxDimension: num(process.env.FACE_MAX_DIMENSION, 640),
  maxFacePhotoMb: num(process.env.MAX_FACE_PHOTO_MB, 4),
  faceBodyLimit: process.env.FACE_BODY_LIMIT || '16mb',

  webDist: path.resolve(__dirname, '../../dist'),
};

// Nilai contoh dari .env.example dianggap belum diisi. Kunci asli berupa JWT,
// jadi tidak akan pernah cocok dengan pola ini.
function isPlaceholder(value) {
  return /placeholder|your-project|your-anon|your-service/i.test(value);
}

function isUnset(value) {
  return !value || isPlaceholder(value);
}

config.validate = function validate() {
  const missing = [];
  if (isUnset(config.supabaseUrl)) missing.push('SUPABASE_URL');
  if (isUnset(config.supabaseServiceRoleKey)) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (isUnset(config.supabaseAnonKey)) missing.push('SUPABASE_ANON_KEY');
  return missing;
};

module.exports = config;
