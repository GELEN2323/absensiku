'use strict';

/**
 * Sumber tunggal jam kerja (P1: tabel settings).
 *
 * Nilai di tabel `settings` menang atas env. Env hanya dipakai sebagai
 * fallback kalau migrasi P1 belum dijalankan, supaya server tetap hidup.
 */

const config = require('./config');
const { addMinutesToTime, timeKey } = require('./time');

const CACHE_TTL_MS = 60_000;
let cache = { at: 0, value: null };

function normalizeTime(value, fallback) {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function fallbackSettings() {
  return {
    jamMasuk: normalizeTime(config.workStart, '07:00'),
    jamPulang: normalizeTime(config.workEnd, '17:00'),
    toleransiMenit: Number.isFinite(Number(config.lateToleranceMin))
      ? Number(config.lateToleranceMin)
      : 15,
  };
}

async function loadWorkSettings() {
  if (cache.value && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  try {
    const { db } = require('./supabase');
    const { data, error } = await db
      .from('settings')
      .select('key, value')
      .in('key', ['jam_masuk', 'jam_pulang', 'toleransi_menit']);

    if (error) throw error;

    const map = new Map((data || []).map((row) => [row.key, row.value]));
    const tolerance = Number(map.get('toleransi_menit'));
    const value = {
      jamMasuk: normalizeTime(map.get('jam_masuk'), fallbackSettings().jamMasuk),
      jamPulang: normalizeTime(map.get('jam_pulang'), fallbackSettings().jamPulang),
      toleransiMenit: Number.isFinite(tolerance) ? tolerance : fallbackSettings().toleransiMenit,
    };

    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.warn('[settings] gagal membaca jam kerja, memakai env:', error.message);
    return fallbackSettings();
  }
}

/**
 * Status absensi dihitung dari jam server (Asia/Jakarta) dan settings.
 * Terlambat bila check-in melewati jam_masuk + toleransi_menit.
 */
function attendanceStatus(checkInAt, work) {
  if (!checkInAt) return null;
  const limit = addMinutesToTime(work.jamMasuk, work.toleransiMenit);
  return timeKey(new Date(checkInAt)) > limit ? 'Terlambat' : 'Hadir';
}

module.exports = {
  loadWorkSettings,
  attendanceStatus,
  fallbackSettings,
};
