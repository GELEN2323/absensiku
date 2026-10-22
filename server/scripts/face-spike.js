'use strict';

/**
 * Spike: pastikan face-api (pure tfjs + wasm, tanpa tfjs-node) bisa
 * memuat model lokal dan menghasilkan descriptor 128-d.
 *
 * Jalankan: node server/scripts/face-spike.js
 */

const path = require('path');
const sharp = require('sharp');
const tf = require('@tensorflow/tfjs');
const wasm = require('@tensorflow/tfjs-backend-wasm');
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');

const MODELS = path.resolve(__dirname, '../public/models');
const WASM_DIR = path.resolve(
  __dirname,
  '../node_modules/@tensorflow/tfjs-backend-wasm/dist'
) + path.sep;
const SAMPLES = path.resolve(
  __dirname,
  '../node_modules/@vladmandic/face-api/demo'
);

async function toTensor(file) {
  const jpeg = await sharp(file)
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  const { data, info } = await sharp(jpeg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
}

async function descriptor(file) {
  const tensor = await toTensor(file);
  try {
    const result = await faceapi
      .detectAllFaces(
        tensor,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })
      )
      .withFaceLandmarks()
      .withFaceDescriptors();
    return result;
  } finally {
    tensor.dispose();
  }
}

function l2normalize(vector) {
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  return vector.map((value) => value / norm);
}

function cosineDistance(a, b) {
  const left = l2normalize(Array.from(a));
  const right = l2normalize(Array.from(b));
  let dot = 0;
  for (let i = 0; i < left.length; i += 1) dot += left[i] * right[i];
  return 1 - dot;
}

async function main() {
  wasm.setWasmPaths(WASM_DIR);
  await tf.setBackend('wasm');
  await tf.ready();
  console.log('backend:', tf.getBackend());

  await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
  console.log('models loaded');

  const results = {};
  for (const name of ['sample1.jpg', 'sample2.jpg', 'sample3.jpg', 'sample4.jpg']) {
    const started = Date.now();
    const found = await descriptor(path.join(SAMPLES, name));
    const ms = Date.now() - started;
    console.log(
      `${name}: faces=${found.length} ms=${ms}` +
        (found[0]
          ? ` box=${Math.round(found[0].detection.box.width)}x${Math.round(
              found[0].detection.box.height
            )} desc=${found[0].descriptor.length}`
          : '')
    );
    if (found[0]) results[name] = found[0].descriptor;
  }

  const names = Object.keys(results);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      console.log(
        `distance ${names[i]} vs ${names[j]} = ${cosineDistance(
          results[names[i]],
          results[names[j]]
        ).toFixed(4)}`
      );
    }
  }
}

main().catch((error) => {
  console.error('SPIKE FAIL:', error);
  process.exit(1);
});
