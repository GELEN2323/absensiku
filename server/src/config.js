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
  maxAccuracyM: num(process.env.MAX_ACCURACY_M, 100),
  geofenceAccuracyMarginM: num(process.env.GEOFENCE_ACCURACY_MARGIN_M, 25),
  workStart: process.env.WORK_START || '08:00',
  workEnd: process.env.WORK_END || '17:00',
  lateToleranceMin: num(process.env.LATE_TOLERANCE_MIN, 0),
  geocodeEnabled: bool(process.env.GEOCODE_ENABLED, true),

  webDist: path.resolve(__dirname, '../../dist'),
};

config.validate = function validate() {
  const missing = [];
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!config.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  return missing;
};

module.exports = config;
