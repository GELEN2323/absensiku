'use strict';

const config = require('./config');

const EARTH_RADIUS_M = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/** Jarak dua koordinat dalam meter (rumus Haversine). */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a)));
}

function parseCoord(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasValidCoords(lat, lng) {
  return (
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Flag mock location dari client (Android: coords.mocked). */
function isMocked(input) {
  return input.mocked === true || input.mock === true || input.is_mocked === true;
}

async function reverseGeocode(lat, lng) {
  if (!config.geocodeEnabled) return null;
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('accept-language', 'id');

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'absensi-app/1.0 (attendance webview)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload.display_name === 'string' ? payload.display_name : null;
  } catch {
    return null;
  }
}

/**
 * Cari titik absen terdekat memakai RPC PostGIS `check_geofence`.
 * Mengembalikan null bila RPC belum ada (migrasi P1 belum dijalankan),
 * supaya server jatuh ke OFFICE_* dari env.
 */
async function nearestAttendancePoint(lat, lng) {
  try {
    const { db } = require('./supabase');
    const { data, error } = await db.rpc('check_geofence', { p_lat: lat, p_lng: lng });
    if (error || !Array.isArray(data) || data.length === 0) return null;

    const nearest = data[0];
    return {
      id: nearest.location_id || null,
      name: nearest.nama || config.office.name,
      distanceM: Math.round(Number(nearest.distance_m) || 0),
      radiusM: Number(nearest.radius_meter) || config.office.radiusM,
    };
  } catch {
    return null;
  }
}

/**
 * Evaluasi lokasi absensi terhadap titik kantor.
 * Selalu mengembalikan objek, tidak pernah throw.
 *
 * P4: validasi radius memakai PostGIS ST_DWithin di database (meter).
 * Bila RPC belum tersedia, fallback ke OFFICE_* + Haversine.
 */
async function evaluateLocation(input = {}) {
  const lat = parseCoord(input.lat);
  const lng = parseCoord(input.lng);
  const accuracy = parseCoord(input.accuracy);
  const mocked = isMocked(input);
  const valid = hasValidCoords(lat, lng);

  if (!valid) {
    return {
      hasLocation: false,
      lat: null,
      lng: null,
      accuracy: accuracy === null ? null : Math.round(accuracy),
      distanceM: null,
      inside: false,
      address: 'Lokasi tidak tersedia',
      available: false,
      mocked,
      locationId: null,
      locationName: config.office.name,
      radiusM: config.office.radiusM,
      toleranceM: 0,
    };
  }

  const nearest = await nearestAttendancePoint(lat, lng);
  const distanceM = nearest
    ? nearest.distanceM
    : haversineMeters(lat, lng, config.office.lat, config.office.lng);
  const radiusM = nearest ? nearest.radiusM : config.office.radiusM;
  const locationName = nearest ? nearest.name : config.office.name;

  // Toleransi akurasi GPS: kalau pengukuran ±20 m, berada 10 m di luar radius
  // masih dianggap di dalam area supaya karyawan tidak ditolak karena galat GPS.
  const tolerance =
    accuracy === null ? 0 : Math.min(accuracy, Math.max(0, config.geofenceAccuracyMarginM));
  const inside = distanceM <= radiusM + tolerance;
  const available = accuracy === null || accuracy <= config.maxAccuracyM;

  let address = 'Lokasi tidak tersedia';
  if (available) {
    address = (await reverseGeocode(lat, lng)) || `Koordinat ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  return {
    hasLocation: true,
    lat,
    lng,
    accuracy: accuracy === null ? null : Math.round(accuracy),
    distanceM,
    inside,
    toleranceM: Math.round(tolerance),
    address,
    available,
    mocked,
    locationId: nearest ? nearest.id : null,
    locationName,
    radiusM,
  };
}

/**
 * Titik absen terdekat untuk tampilan UI (nama, jarak, radius).
 * Fallback ke OFFICE_* saat tabel locations belum ada.
 */
async function nearestPoint(lat, lng) {
  if (!hasValidCoords(lat, lng)) return null;

  const nearest = await nearestAttendancePoint(lat, lng);
  if (nearest) {
    return {
      id: nearest.id,
      nama: nearest.name,
      lat: nearest.lat,
      lng: nearest.lng,
      distance_m: nearest.distanceM,
      radius_meter: nearest.radiusM,
    };
  }

  return {
    id: null,
    nama: config.office.name,
    lat: config.office.lat,
    lng: config.office.lng,
    distance_m: haversineMeters(lat, lng, config.office.lat, config.office.lng),
    radius_meter: config.office.radiusM,
  };
}

module.exports = {
  haversineMeters,
  evaluateLocation,
  nearestPoint,
  isMocked,
  parseCoord,
};
