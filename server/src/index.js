'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { db } = require('./supabase');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  // Data absensi harus selalu segar; jangan biarkan browser memakai cache 304.
  res.set('Cache-Control', 'no-store, max-age=0');
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.get('/api/health', async (_req, res) => {
  const started = Date.now();
  const { error } = await db.from('profiles').select('id', { head: true, count: 'exact' });
  res.status(error ? 503 : 200).json({
    ok: !error,
    database: error ? 'down' : 'up',
    latency_ms: Date.now() - started,
    server_time: new Date().toISOString(),
    office: config.office,
    message: error ? error.message : undefined,
  });
});

app.get('/api/office', (_req, res) => {
  res.json({ office: config.office });
});

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { message: 'Endpoint tidak ditemukan.' } });
});

const indexPath = path.join(config.webDist, 'index.html');
const hasWebBuild = fs.existsSync(indexPath);

if (hasWebBuild) {
  app.use(
    '/_expo/static',
    express.static(path.join(config.webDist, '_expo/static'), {
      immutable: true,
      maxAge: '1y',
    })
  );
  app.use(express.static(config.webDist, { maxAge: config.isProduction ? '1h' : 0 }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(indexPath);
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      name: 'Absensi API',
      status: 'running',
      web_build: 'not found',
      hint: 'Jalankan `npm run build:web` di root project untuk menghasilkan folder dist.',
    });
  });
}

app.use((err, _req, res, _next) => {
  const status = Number(err.statusCode || err.status || 500);
  if (status >= 500) console.error('[server error]', err);

  const message =
    status >= 500 && config.isProduction
      ? 'Terjadi kesalahan pada server.'
      : err.message || 'Terjadi kesalahan.';

  res.status(status).json({
    error: {
      message,
      details: err.details,
    },
  });
});

const missing = config.validate();
if (missing.length > 0) {
  console.warn(`[config] Environment belum lengkap: ${missing.join(', ')}`);
}

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[api] listening on http://localhost:${config.port}`);
  console.log(`[api] web build: ${hasWebBuild ? config.webDist : 'belum ada (dev mode)'}`);
  console.log(`[api] office: ${config.office.name} (${config.office.lat}, ${config.office.lng}) r=${config.office.radiusM}m`);
});

function shutdown(signal) {
  console.log(`[api] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
