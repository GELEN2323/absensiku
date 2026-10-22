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
 * Evaluasi lokasi absensi terhadap titik kantor.
 * Selalu mengembalikan objek, tidak pernah throw.
 */
async function evaluateLocation(input = {}) {
  const lat = parseCoord(input.lat);
  const lng = parseCoord(input.lng);
  const accuracy = parseCoord(input.accuracy);
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
    };
  }

  const distanceM = haversineMeters(lat, lng, config.office.lat, config.office.lng);

  // Toleransi akurasi GPS: kalau pengukuran ±20 m, berada 10 m di luar radius
  // masih dianggap di dalam area supaya karyawan tidak ditolak karena galat GPS.
  const tolerance =
    accuracy === null ? 0 : Math.min(accuracy, Math.max(0, config.geofenceAccuracyMarginM));
  const inside = distanceM <= config.office.radiusM + tolerance;
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
  };
}

module.exports = {
  haversineMeters,
  evaluateLocation,
  parseCoord,
};
