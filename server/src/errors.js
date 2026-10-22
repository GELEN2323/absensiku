'use strict';

class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new HttpError(400, message, details);
}

function unauthorized(message = 'Sesi tidak valid. Silakan login kembali.') {
  return new HttpError(401, message);
}

function forbidden(message = 'Anda tidak memiliki akses ke fitur ini.') {
  return new HttpError(403, message);
}

function notFound(message = 'Data tidak ditemukan.') {
  return new HttpError(404, message);
}

function conflict(message) {
  return new HttpError(409, message);
}

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
