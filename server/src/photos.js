'use strict';

const sharp = require('sharp');
const config = require('./config');
const { db } = require('./supabase');
const { HttpError } = require('./errors');

const BUCKET = 'employee-photos';
const FOLDER = 'attendance';
const IZIN_FOLDER = 'izin';

const EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Foto dikirim dari browser/app sebagai data URL base64.
 * Ukuran dibatasi supaya request tidak membengkak.
 */
function parseDataUrl(input) {
  if (typeof input !== 'string') return null;

  const match = input.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;

  const base64 = match[2].replace(/\s/g, '');
  if (!base64) return null;

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) return null;

  return { contentType: match[1].toLowerCase(), buffer };
}

function objectPath(employeeId, date, type, extension) {
  return `${FOLDER}/${employeeId}/${date}-${type}.${extension}`;
}

function publicUrl(path, version) {
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return null;
  return version ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function jakartaLabel(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Watermark NIK + nama + timestamp server + titik absen (P4/P14).
 * Kalau sharp gagal menggambar teks (font tidak tersedia), foto tetap
 * diunggah tanpa watermark supaya absensi tidak ikut gagal.
 */
async function watermarkPhoto(buffer, info = {}) {
  const base = await sharp(buffer)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  try {
    const meta = await sharp(base).metadata();
    const width = meta.width || 640;
    const height = meta.height || 480;
    const fontSize = Math.max(11, Math.round(width * 0.026));
    const lineHeight = Math.round(fontSize * 1.4);
    const padding = Math.max(8, Math.round(fontSize * 0.7));
    const barHeight = Math.min(height, padding * 2 + lineHeight * 3);

    const line1 = `NIK ${info.nip || '-'} - ${info.nama || 'Karyawan'}`;
    const line2 = `${jakartaLabel(info.serverTime)} WIB`;
    const line3 = info.locationName
      ? `${info.locationName}${info.distanceM ? ` (${info.distanceM} m)` : ''}`
      : 'Lokasi terekam server';

    const svg = `
      <svg width="${width}" height="${barHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="rgba(11,18,32,0.62)" />
        <text x="${padding}" y="${padding + fontSize}" fill="#ffffff"
          font-family="DejaVu Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="700">
          ${escapeXml(line1)}
        </text>
        <text x="${padding}" y="${padding + fontSize + lineHeight}" fill="#D7E3EA"
          font-family="DejaVu Sans, Arial, sans-serif" font-size="${Math.round(fontSize * 0.86)}">
          ${escapeXml(line2)}
        </text>
        <text x="${padding}" y="${padding + fontSize + lineHeight * 2}" fill="#D7E3EA"
          font-family="DejaVu Sans, Arial, sans-serif" font-size="${Math.round(fontSize * 0.86)}">
          ${escapeXml(line3)}
        </text>
      </svg>
    `;

    return await sharp(base)
      .composite([{ input: Buffer.from(svg), top: height - barHeight, left: 0 }])
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (error) {
    console.warn('[photos] watermark gagal, memakai foto asli:', error.message);
    return base;
  }
}

/** Validasi payload foto sebelum ada penulisan ke database. */
function assertPhoto(photo) {
  const parsed = parseDataUrl(photo);
  if (!parsed) {
    throw new HttpError(400, 'Format foto tidak valid. Kirim gambar JPEG/PNG.');
  }

  const maxBytes = config.maxPhotoMb * 1024 * 1024;
  if (parsed.buffer.length > maxBytes) {
    throw new HttpError(413, `Ukuran foto maksimal ${config.maxPhotoMb} MB.`);
  }

  return parsed;
}

/** Simpan foto absensi (menimpa foto lama pada tanggal & tipe yang sama). */
async function uploadAttendancePhoto({ employeeId, date, type, photo, watermark = null }) {
  const parsed = parseDataUrl(photo);
  if (!parsed) {
    throw new HttpError(400, 'Format foto tidak valid. Kirim gambar JPEG/PNG.');
  }

  const maxBytes = config.maxPhotoMb * 1024 * 1024;
  if (parsed.buffer.length > maxBytes) {
    throw new HttpError(413, `Ukuran foto maksimal ${config.maxPhotoMb} MB.`);
  }

  let buffer = parsed.buffer;
  let contentType = parsed.contentType;

  if (watermark) {
    try {
      buffer = await watermarkPhoto(parsed.buffer, watermark);
      contentType = 'image/jpeg';
    } catch (error) {
      console.warn('[photos] gagal menyiapkan watermark:', error.message);
    }
  }

  const extension = EXTENSION_BY_TYPE[contentType] || 'jpg';
  const path = objectPath(employeeId, date, type, extension);

  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    upsert: true,
    contentType,
    cacheControl: '3600',
  });

  if (error) {
    throw new HttpError(502, `Foto gagal disimpan: ${error.message}`);
  }

  return publicUrl(path, Date.now());
}

/**
 * Versi yang tidak melempar error: absensi sudah tersimpan, foto hanya
 * pelengkap. Kalau storage gagal, baris tetap ada dengan needs_photo=true.
 */
async function uploadAttendancePhotoSafe(options) {
  try {
    return { url: await uploadAttendancePhoto(options), error: null };
  } catch (error) {
    console.warn('[photos] upload gagal:', error.message);
    return { url: null, error: error.message };
  }
}

/**
 * Foto pendukung izin. Coba bucket privat `izin` (P1) lalu fallback ke
 * `employee-photos` supaya tetap jalan di database yang belum dimigrasi.
 */
async function uploadIzinPhotoSafe({ employeeId, photo, watermark = null }) {
  try {
    const parsed = assertPhoto(photo);
    let buffer = parsed.buffer;
    if (watermark) {
      try {
        buffer = await watermarkPhoto(parsed.buffer, watermark);
      } catch (error) {
        console.warn('[photos] watermark izin gagal:', error.message);
      }
    }

    const path = `${IZIN_FOLDER}/${employeeId}/${Date.now()}.jpg`;
    const buckets = ['izin', BUCKET];
    let savedBucket = null;
    let lastMessage = '';

    for (const bucket of buckets) {
      const { error } = await db.storage.from(bucket).upload(path, buffer, {
        upsert: true,
        contentType: 'image/jpeg',
        cacheControl: '3600',
      });
      if (!error) {
        savedBucket = bucket;
        break;
      }
      lastMessage = error.message;
      // Bucket tidak ada -> coba bucket berikutnya. Error lain -> berhenti.
      if (!/not found|does not exist|bucket/i.test(error.message)) break;
    }

    if (!savedBucket) {
      throw new HttpError(502, `Foto izin gagal disimpan: ${lastMessage}`);
    }

    if (savedBucket === BUCKET) {
      return { url: publicUrl(path, Date.now()), error: null };
    }

    const { data: signed, error: signedError } = await db.storage
      .from(savedBucket)
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    if (signedError || !signed?.signedUrl) {
      throw new HttpError(502, `Foto izin tersimpan tetapi URL gagal dibuat: ${signedError?.message || 'unknown'}`);
    }
    return { url: signed.signedUrl, error: null };
  } catch (error) {
    console.warn('[photos] upload izin gagal:', error.message);
    return { url: null, error: error.message };
  }
}

/**
 * Daftar foto milik satu karyawan, dipetakan ke `YYYY-MM-DD-in|out`.
 * Dipakai agar URL foto bisa ditampilkan tanpa kolom tambahan di tabel attendance.
 */
async function attendancePhotoMap(employeeId) {
  const map = new Map();
  if (!employeeId) return map;

  const { data, error } = await db.storage.from(BUCKET).list(`${FOLDER}/${employeeId}`, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) {
    // Foto bersifat pelengkap: jangan gagalkan seluruh request absensi.
    console.warn('[photos] gagal membaca daftar foto:', error.message);
    return map;
  }

  for (const item of data || []) {
    const match = String(item.name || '').match(
      /^(\d{4}-\d{2}-\d{2})-(in|out)\.(jpg|jpeg|png|webp)$/i
    );
    if (!match) continue;

    const version = item.updated_at ? Date.parse(item.updated_at) : undefined;
    map.set(
      `${match[1]}-${match[2].toLowerCase()}`,
      publicUrl(`${FOLDER}/${employeeId}/${item.name}`, Number.isFinite(version) ? version : undefined)
    );
  }

  return map;
}

/** Tempelkan URL foto ke record absensi (null kalau tidak ada fotonya). */
function attachPhotos(record, photoMap) {
  if (!record) return record;

  const key = String(record.tanggal || '');
  return {
    ...record,
    check_in_photo: photoMap.get(`${key}-in`) || null,
    check_out_photo: photoMap.get(`${key}-out`) || null,
  };
}

module.exports = {
  assertPhoto,
  parseDataUrl,
  watermarkPhoto,
  uploadAttendancePhoto,
  uploadAttendancePhotoSafe,
  uploadIzinPhotoSafe,
  attendancePhotoMap,
  attachPhotos,
};
