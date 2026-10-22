'use strict';

const config = require('./config');
const { db } = require('./supabase');
const { HttpError } = require('./errors');

const BUCKET = 'employee-photos';
const FOLDER = 'attendance';

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

/** Simpan foto absensi (menimpa foto lama pada tanggal & tipe yang sama). */
async function uploadAttendancePhoto({ employeeId, date, type, photo }) {
  const parsed = parseDataUrl(photo);
  if (!parsed) {
    throw new HttpError(400, 'Format foto tidak valid. Kirim gambar JPEG/PNG.');
  }

  const maxBytes = config.maxPhotoMb * 1024 * 1024;
  if (parsed.buffer.length > maxBytes) {
    throw new HttpError(413, `Ukuran foto maksimal ${config.maxPhotoMb} MB.`);
  }

  const extension = EXTENSION_BY_TYPE[parsed.contentType] || 'jpg';
  const path = objectPath(employeeId, date, type, extension);

  const { error } = await db.storage.from(BUCKET).upload(path, parsed.buffer, {
    upsert: true,
    contentType: parsed.contentType,
    cacheControl: '3600',
  });

  if (error) {
    throw new HttpError(502, `Foto gagal disimpan: ${error.message}`);
  }

  return publicUrl(path, Date.now());
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
  uploadAttendancePhoto,
  attendancePhotoMap,
  attachPhotos,
};
