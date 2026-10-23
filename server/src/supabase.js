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

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  // Jangan pernah jatuh ke URL placeholder: hasilnya error DNS yang membingungkan
  // di request pertama, bukan pesan jelas di sini.
  throw new Error(
    '[supabase] Kredensial Supabase belum diisi. Set SUPABASE_URL, SUPABASE_ANON_KEY, ' +
      'dan SUPABASE_SERVICE_ROLE_KEY di server/.env.'
  );
}

// Client dengan anon key: dipakai untuk login, refresh session, dan validasi token.
const authClient = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey || config.supabaseServiceRoleKey,
  authOptions
);

// Client service role: HANYA dipakai di server untuk baca/tulis data.
// Jangan pernah mengirim key ini ke browser / WebView.
const db = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, authOptions);

module.exports = { db, authClient };
