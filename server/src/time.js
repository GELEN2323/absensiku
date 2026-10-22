'use strict';

const config = require('./config');

const TIME_ZONE = 'Asia/Jakarta';
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  weekday: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Tanggal WIB dalam format YYYY-MM-DD. */
function dateKey(date = new Date()) {
  return dateFormatter.format(date);
}

/** Nama hari Indonesia untuk sebuah tanggal/jam. */
function hariName(date = new Date()) {
  const short = weekdayFormatter.format(date);
  return HARI[WEEKDAY_INDEX[short] ?? 0];
}

/** Jam WIB dalam format HH:MM. */
function timeKey(date = new Date()) {
  return timeFormatter.format(date);
}

function addMinutesToTime(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Terlambat jika check-in melewati jam masuk + toleransi. */
function isLate(checkInAt) {
  if (!checkInAt) return false;
  const limit = addMinutesToTime(config.workStart, config.lateToleranceMin);
  return timeKey(new Date(checkInAt)) > limit;
}

function minutesBetween(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

/** Format durasi: 7j 6m. */
function formatDuration(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const jam = Math.floor(minutes / 60);
  const sisa = minutes % 60;
  return `${jam}j ${sisa}m`;
}

function shiftDate(dateStr, days) {
  const base = new Date(`${dateStr}T00:00:00+07:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return dateKey(base);
}

function monthRange(month) {
  const now = new Date();
  const match = /^(\d{4})-(\d{2})$/.exec(month || '');
  const year = match ? Number(match[1]) : Number(dateKey(now).slice(0, 4));
  const mon = match ? Number(match[2]) : Number(dateKey(now).slice(5, 7));
  const start = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const end = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function lastNDates(n) {
  const today = dateKey();
  return Array.from({ length: n }, (_, i) => shiftDate(today, -(n - 1 - i)));
}

module.exports = {
  dateKey,
  hariName,
  timeKey,
  isLate,
  minutesBetween,
  formatDuration,
  shiftDate,
  monthRange,
  lastNDates,
};
