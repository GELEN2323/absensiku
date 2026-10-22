'use strict';

/**
 * Build web production.
 *
 * Build web harus memakai API same-origin, jadi EXPO_PUBLIC_API_URL dikosongkan
 * supaya URL localhost dari .env dev tidak ikut ter-bundle ke browser pengguna.
 */

const { spawn } = require('child_process');

const env = {
  ...process.env,
  EXPO_PUBLIC_API_URL: '',
  EXPO_PUBLIC_WEBVIEW_URL: '',
  NODE_ENV: 'production',
};

const args = ['expo', 'export', '--platform', 'web', ...process.argv.slice(2)];

const child = spawn('npx', args, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});
