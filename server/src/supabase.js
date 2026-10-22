'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const authOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

// Client dengan anon key: dipakai untuk login, refresh session, dan validasi token.
const authClient = createClient(
  config.supabaseUrl || 'https://placeholder.supabase.co',
  config.supabaseAnonKey || config.supabaseServiceRoleKey || 'placeholder-anon-key',
  authOptions
);

// Client service role: HANYA dipakai di server untuk baca/tulis data.
// Jangan pernah mengirim key ini ke browser / WebView.
const db = createClient(
  config.supabaseUrl || 'https://placeholder.supabase.co',
  config.supabaseServiceRoleKey || 'placeholder-service-key',
  authOptions
);

module.exports = { db, authClient };
