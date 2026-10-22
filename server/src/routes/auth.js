'use strict';

const express = require('express');
const {
  register,
  signIn,
  refreshSession,
  requireAuth,
  serializeUser,
  changePassword,
} = require('../auth');
const { HttpError, unauthorized } = require('../errors');

const router = express.Router();

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map();

function rateLimit(key) {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { first: now, count: 1 });
    return;
  }

  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new HttpError(429, 'Terlalu banyak percobaan login. Coba lagi dalam 10 menit.');
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now - entry.first > WINDOW_MS) attempts.delete(key);
  }
}, WINDOW_MS).unref();

router.post('/login', async (req, res) => {
  const identifier = req.body?.identifier || req.body?.email || req.body?.nik || '';
  const password = req.body?.password || '';
  const key = `${req.ip}:${String(identifier).toLowerCase()}`;

  rateLimit(key);

  const session = await signIn(identifier, password);
  attempts.delete(key);

  res.json(session);
});

router.post('/register', async (req, res) => {
  const key = `register:${req.ip}`;
  rateLimit(key);

  const result = await register(req.body || {});
  res.status(201).json(result);
});

router.post('/refresh', async (req, res) => {
  const session = await refreshSession(req.body?.refresh_token);
  res.json(session);
});

router.get('/me', requireAuth, (req, res) => {
  const user = serializeUser({ profile: req.user.profile, employee: req.user.employee });
  if (!user) throw unauthorized();
  res.json({ user });
});

router.post('/password', requireAuth, async (req, res) => {
  await changePassword(req.user, req.body?.old_password, req.body?.new_password);
  res.json({ ok: true, message: 'Password berhasil diubah.' });
});

router.post('/logout', requireAuth, (_req, res) => {
  // Token Supabase bersifat stateless. Client menghapus token dari storage.
  res.json({ ok: true });
});

module.exports = router;
