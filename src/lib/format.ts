const TIME_ZONE = 'Asia/Jakarta';

// Default server time - will be overridden when server time is available
let serverNow: Date | null = null;

// Function to set server time (called from app initialization)
export function setServerTime(time: Date | string | null) {
  if (time === null || time === undefined) {
    serverNow = null;
  } else if (time instanceof Date) {
    serverNow = time;
  } else {
    serverNow = new Date(time);
  }
}

// Get current time - uses server time if available, falls back to client
function getCurrentTime(): Date {
  if (serverNow !== null && !isNaN(serverNow.getTime())) {
    return new Date(serverNow.getTime());
  }
  return new Date();
}

const idFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayKey(): string {
  return idFormatter.format(getCurrentTime());
}

export function currentMonth(): string {
  return todayKey().slice(0, 7);
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('id-ID', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDateKey(key: string | null | undefined, withWeekday = true): string {
  if (!key) return '—';
  // Use server time if key is today's date, otherwise parse from key
  const date = new Date(`${key}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString('id-ID', {
    timeZone: TIME_ZONE,
    weekday: withWeekday ? 'long' : undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMonth(month: string): string {
  if (!month) return '—';
  const date = new Date(`${month}-01T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString('id-ID', {
    timeZone: TIME_ZONE,
    month: 'long',
    year: 'numeric',
  });
}

export function shiftMonth(month: string, delta: number): string {
  if (!month) return month;
  const [year, mon] = month.split('-').map(Number);
  // Use UTC to avoid timezone issues
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function initials(name: string | null | undefined): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(minutes: number | null | undefined): string {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(value / 60)}j ${value % 60}m`;
}

// GREETING FUNGSI - sekarang pakai server time jika tersedia
export function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      hour12: false,
    }).format(getCurrentTime())
  );
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}