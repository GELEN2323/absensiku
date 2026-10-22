'use strict';

/**
 * Test library face tanpa database.
 * Jalankan: node server/scripts/face-lib-test.js
 */

const path = require('path');
const sharp = require('sharp');
const {
  detectFace,
  analyzeLiveness,
  euclideanDistance,
  toVectorLiteral,
  parseVector,
} = require('../src/lib/face');

const SAMPLES = path.resolve(
  __dirname,
  '../node_modules/@vladmandic/face-api/demo'
);
const sample = (name) => path.join(SAMPLES, name);

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function expectError(name, promise, code) {
  try {
    await promise;
    check(name, false, 'tidak melempar error');
  } catch (error) {
    check(name, error.code === code, `code=${error.code} (harap ${code})`);
  }
}

async function main() {
  const buf2 = await sharp(sample('sample2.jpg')).jpeg().toBuffer();
  const bufMulti = await sharp(sample('sample4.jpg')).jpeg().toBuffer();

  // 1. Satu wajah
  const single = await detectFace(buf2);
  check(
    'deteksi 1 wajah + descriptor 128-d',
    single.descriptor?.length === 128 && single.ear > 0,
    `ear=${single.ear.toFixed(2)} box=${single.box.width}x${single.box.height}`
  );

  // 2. Banyak wajah
  await expectError('tolak multi-wajah', detectFace(bufMulti), 'MULTIPLE_FACES');

  // 3. Gelap
  const dark = await sharp(buf2).modulate({ brightness: 0.15 }).jpeg().toBuffer();
  await expectError('tolak foto gelap', detectFace(dark), 'BAD_QUALITY');

  // 4. Blur
  const blur = await sharp(buf2).blur(4).jpeg().toBuffer();
  await expectError('tolak foto blur', detectFace(blur), 'BAD_QUALITY');

  // 5. Tanpa wajah
  const blank = await sharp({
    create: { width: 640, height: 480, channels: 3, background: '#9aa0a6' },
  })
    .jpeg()
    .toBuffer();
  // Gambar polos kontrasnya 0, jadi bisa tertolak sebagai BAD_QUALITY
  // sebelum sempat deteksi. Dua-duanya benar; yang penting ditolak.
  try {
    await detectFace(blank);
    check('tolak gambar tanpa wajah', false, 'tidak melempar error');
  } catch (error) {
    check('tolak gambar tanpa wajah', ['NO_FACE', 'BAD_QUALITY'].includes(error.code), error.code);
  }

  // 6. Jarak foto yang sama
  const singleAgain = await detectFace(buf2);
  const selfDistance = euclideanDistance(single.descriptor, singleAgain.descriptor);
  check('jarak foto identik ~0', selfDistance < 0.05, `distance=${selfDistance.toFixed(4)}`);

  // 7. Jarak orang berbeda: crop salah satu wajah di sample4
  const meta = await sharp(bufMulti).metadata();
  const crop = await sharp(bufMulti)
    .extract({
      left: Math.round(meta.width * 0.05),
      top: Math.round(meta.height * 0.1),
      width: Math.round(meta.width * 0.34),
      height: Math.round(meta.height * 0.75),
    })
    .jpeg()
    .toBuffer();

  let other = null;
  try {
    other = await detectFace(crop);
  } catch (error) {
    console.log(`INFO  crop wajah lain gagal: ${error.code || error.message}`);
  }

  if (other) {
    const different = euclideanDistance(single.descriptor, other.descriptor);
    check(
      'jarak orang berbeda > threshold duplikat 0.35',
      different > 0.35,
      `distance=${different.toFixed(4)}`
    );
  }

  // 8. Liveness
  const open = { ear: 0.32 };
  const closed = { ear: 0.1 };
  const seq = (ears) => ears.map((ear) => ({ ear }));

  const closeEyes = analyzeLiveness(
    seq([0.32, 0.3, 0.1, 0.1, 0.1, 0.3, 0.32, 0.31, 0.3, 0.32]),
    'close_eyes'
  );
  check('liveness close_eyes lolos', closeEyes.passed, JSON.stringify(closeEyes));

  const allOpen = analyzeLiveness(seq(Array(10).fill(0.32)), 'close_eyes');
  check('liveness close_eyes gagal saat mata terbuka', !allOpen.passed, allOpen.reason);

  const blinkTwice = analyzeLiveness(
    seq([0.32, 0.1, 0.32, 0.31, 0.1, 0.32, 0.31, 0.3, 0.32, 0.31]),
    'blink_twice'
  );
  check('liveness blink_twice lolos', blinkTwice.passed, JSON.stringify(blinkTwice));

  const blinkOnce = analyzeLiveness(
    seq([0.32, 0.1, 0.32, 0.31, 0.32, 0.3, 0.31, 0.3, 0.32, 0.31]),
    'blink_twice'
  );
  check('liveness blink_twice gagal saat kedip 1x', !blinkOnce.passed, blinkOnce.reason);

  const tooFew = analyzeLiveness([open, closed], 'close_eyes');
  check('liveness gagal saat frame sedikit', !tooFew.passed, tooFew.reason);

  // 9. Vector literal
  const vector = [0.1, -0.2, 0.3];
  const literal = toVectorLiteral(vector);
  const parsed = parseVector(literal);
  check(
    'vector literal roundtrip',
    literal === '[0.100000,-0.200000,0.300000]' &&
      parsed.length === 3 &&
      Math.abs(parsed[1] + 0.2) < 1e-9,
    literal
  );

  console.log(`\n${pass}/${pass + fail} test lulus`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('TEST ERROR:', error);
  process.exit(1);
});
