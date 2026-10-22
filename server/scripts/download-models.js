'use strict';

/**
 * Unduh model face-api ke server/public/models (lokal, tanpa CDN).
 * Jalankan sekali: node server/scripts/download-models.js
 */

const fs = require('fs');
const path = require('path');

const BASE =
  'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
const DEST = path.resolve(__dirname, '../public/models');

const FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

async function download(name) {
  const target = path.join(DEST, name);
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    console.log(`skip  ${name}`);
    return;
  }

  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
  console.log(`saved ${name} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  fs.mkdirSync(DEST, { recursive: true });
  for (const file of FILES) await download(file);

  const total = FILES.reduce(
    (sum, file) => sum + fs.statSync(path.join(DEST, file)).size,
    0
  );
  console.log(`\nModel siap di ${DEST} (${(total / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((error) => {
  console.error('Gagal mengunduh model:', error.message);
  process.exit(1);
});
