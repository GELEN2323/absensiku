'use strict';

/**
 * Face pipeline sisi server.
 *
 * Backend: tfjs murni + tfjs-backend-wasm (tanpa tfjs-node / native build).
 * Model: tinyFaceDetector + faceLandmark68 + faceRecognition (128-d).
 *
 * Catatan metrik:
 * Descriptor face-api TIDAK dinormalisasi dan cosine TIDAK diskriminatif.
 * Pengukuran pada sample face-api:
 *   beda orang  : cosine 0.06-0.18, euclidean 0.52-0.89
 *   orang sama  : euclidean ~0.25-0.45 (3 foto dirata-rata)
 * Karena itu jarak yang dipakai adalah EUCLIDEAN, bukan cosine.
 */

const path = require('path');
const sharp = require('sharp');
const tf = require('@tensorflow/tfjs');
const wasm = require('@tensorflow/tfjs-backend-wasm');
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
const config = require('../config');

const FACE_DIR = path.resolve(__dirname, '../../public/models');
const WASM_DIR =
  path.resolve(__dirname, '../../node_modules/@tensorflow/tfjs-backend-wasm/dist') + path.sep;

const DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i;

const EYE_CLOSED_EAR = 0.21;

class FaceError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'FaceError';
    this.code = code;
    this.statusCode = 422;
    this.details = details;
  }
}

let ready = null;

/** Muat model sekali per proses. */
function loadFaceApi() {
  if (ready) return ready;

  ready = (async () => {
    wasm.setWasmPaths(WASM_DIR);
    await tf.setBackend('wasm');
    await tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromDisk(FACE_DIR),
      faceapi.nets.faceLandmark68Net.loadFromDisk(FACE_DIR),
      faceapi.nets.faceRecognitionNet.loadFromDisk(FACE_DIR),
    ]);
    console.log(`[face] model siap (backend ${tf.getBackend()})`);
  })().catch((error) => {
    ready = null;
    throw error;
  });

  return ready;
}

// Inference CPU-bound: serialkan supaya tidak berebut memori/CPU.
let queue = Promise.resolve();
function withInference(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function decodeDataUrl(input, maxBytes = config.maxFacePhotoMb * 1024 * 1024) {
  if (typeof input !== 'string') {
    throw new FaceError('BAD_PAYLOAD', 'Format foto tidak valid.');
  }
  const match = input.match(DATA_URL);
  if (!match) {
    throw new FaceError('BAD_PAYLOAD', 'Foto harus berupa data URL JPEG/PNG.');
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw new FaceError('BAD_PAYLOAD', 'Foto kosong.');
  if (buffer.length > maxBytes) {
    throw new FaceError('BAD_PAYLOAD', `Ukuran foto maksimal ${config.maxFacePhotoMb} MB.`);
  }
  return buffer;
}

async function prepare(buffer) {
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({
      width: config.faceMaxDimension,
      height: config.faceMaxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const { data, info } = await sharp(jpeg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const grey = await sharp(jpeg).greyscale().raw().toBuffer();
  let sum = 0;
  for (const value of grey) sum += value;
  const mean = sum / grey.length;

  let variance = 0;
  for (const value of grey) variance += (value - mean) ** 2;
  const contrast = Math.sqrt(variance / grey.length);

  // Varians Laplacian kasar sebagai penanda blur.
  const laplacian = await sharp(jpeg)
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] })
    .raw()
    .toBuffer();

  let lapSum = 0;
  for (const value of laplacian) lapSum += value;
  const lapMean = lapSum / laplacian.length;
  let lapVariance = 0;
  for (const value of laplacian) lapVariance += (value - lapMean) ** 2;
  const sharpness = Math.sqrt(lapVariance / laplacian.length);

  return {
    raw: data,
    width: info.width,
    height: info.height,
    mean,
    contrast,
    sharpness,
  };
}

function checkQuality(prepared) {
  if (prepared.mean < config.faceMinBrightness) {
    throw new FaceError('BAD_QUALITY', 'Foto terlalu gelap. Cari tempat lebih terang.', {
      mean: Math.round(prepared.mean),
    });
  }
  if (prepared.mean > config.faceMaxBrightness) {
    throw new FaceError('BAD_QUALITY', 'Foto terlalu terang / silau.', {
      mean: Math.round(prepared.mean),
    });
  }
  if (prepared.sharpness < config.faceMinSharpness) {
    throw new FaceError('BAD_QUALITY', 'Foto blur. Tahan HP lebih stabil.', {
      sharpness: Math.round(prepared.sharpness),
    });
  }
  if (prepared.contrast < config.faceMinContrast) {
    throw new FaceError('BAD_QUALITY', 'Kontras foto terlalu rendah.', {
      contrast: Math.round(prepared.contrast),
    });
  }
}

function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(landmarks) {
  const ratio = (eye) =>
    (distance2d(eye[1], eye[5]) + distance2d(eye[2], eye[4])) /
    (2 * Math.max(0.0001, distance2d(eye[0], eye[3])));

  return (ratio(landmarks.getLeftEye()) + ratio(landmarks.getRightEye())) / 2;
}

/**
 * Deteksi wajah pada satu gambar.
 * @param {Buffer} buffer
 * @param {{ descriptors?: boolean, requireSingle?: boolean }} options
 */
async function detectFace(buffer, options = {}) {
  const { descriptors = true, requireSingle = true } = options;

  return withInference(async () => {
    await loadFaceApi();

    const prepared = await prepare(buffer);
    checkQuality(prepared);

    const tensor = tf.tensor3d(
      new Uint8Array(prepared.raw),
      [prepared.height, prepared.width, 3],
      'int32'
    );

    try {
      let task = faceapi.detectAllFaces(
        tensor,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: config.faceDetectorInputSize,
          scoreThreshold: config.faceDetectorScore,
        })
      );
      task = task.withFaceLandmarks();
      if (descriptors) task = task.withFaceDescriptors();

      const results = await task;
      if (!results.length) {
        throw new FaceError('NO_FACE', 'Wajah tidak terdeteksi. Pastikan wajah terlihat jelas.', {
          mean: Math.round(prepared.mean),
          sharpness: Math.round(prepared.sharpness),
        });
      }
      if (requireSingle && results.length > 1) {
        throw new FaceError(
          'MULTIPLE_FACES',
          'Terdeteksi lebih dari satu wajah. Pastikan hanya kamu di depan kamera.',
          { faces: results.length }
        );
      }

      const best = results.slice().sort((a, b) => {
        const areaA = a.detection.box.width * a.detection.box.height;
        const areaB = b.detection.box.width * b.detection.box.height;
        return areaB - areaA;
      })[0];

      const box = best.detection.box;
      if (Math.min(box.width, box.height) < config.faceMinBoxPx) {
        throw new FaceError('BAD_QUALITY', 'Wajah terlalu kecil / jauh. Dekatkan ke kamera.', {
          box: Math.round(Math.min(box.width, box.height)),
        });
      }

      return {
        descriptor: best.descriptor
          ? Array.from(best.descriptor, (value) => Number(value.toFixed(6)))
          : null,
        ear: eyeAspectRatio(best.landmarks),
        box: {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
        },
        score: Number(best.detection.score.toFixed(4)),
        quality: {
          mean: Math.round(prepared.mean),
          contrast: Math.round(prepared.contrast),
          sharpness: Math.round(prepared.sharpness),
        },
      };
    } finally {
      tensor.dispose();
    }
  });
}

function meanDescriptor(descriptors) {
  if (!descriptors.length) throw new FaceError('NO_FACE', 'Tidak ada descriptor wajah.');
  const size = descriptors[0].length;
  const result = new Array(size).fill(0);
  for (const descriptor of descriptors) {
    for (let i = 0; i < size; i += 1) result[i] += descriptor[i];
  }
  for (let i = 0; i < size; i += 1) result[i] /= descriptors.length;
  return result;
}

function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** PostgREST butuh literal '[0.1,0.2,...]' untuk kolom vector. */
function toVectorLiteral(vector) {
  return `[${vector.map((value) => Number(value).toFixed(6)).join(',')}]`;
}

/** Terima array atau string vektor dari Supabase. */
function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    const text = value.trim().replace(/^\[|\]$/g, '');
    if (!text) return [];
    return text.split(',').map((part) => Number(part));
  }
  return [];
}

/**
 * Analisis liveness dari deretan frame.
 * @param {Array<{ear:number}|null>} frames
 * @param {'blink_twice'|'close_eyes'} challenge
 */
function analyzeLiveness(frames, challenge) {
  const detected = frames.filter(Boolean);
  if (detected.length < config.faceMinDetectedFrames) {
    return {
      passed: false,
      reason: 'FACE_NOT_VISIBLE',
      message: 'Wajah tidak terlihat cukup jelas selama verifikasi.',
      detected: detected.length,
    };
  }

  const states = detected.map((frame) => (frame.ear < EYE_CLOSED_EAR ? 'closed' : 'open'));

  let closedRuns = 0;
  let longestClosed = 0;
  let currentClosed = 0;
  let transitions = 0;

  for (let i = 0; i < states.length; i += 1) {
    if (states[i] === 'closed') {
      currentClosed += 1;
      if (currentClosed === 1) closedRuns += 1;
      longestClosed = Math.max(longestClosed, currentClosed);
    } else {
      if (i > 0 && states[i - 1] === 'closed') transitions += 1;
      currentClosed = 0;
    }
  }

  let passed = false;
  if (challenge === 'close_eyes') {
    passed = longestClosed >= config.faceMinClosedFrames;
  } else {
    passed = transitions >= 2;
  }

  return {
    passed,
    reason: passed ? 'OK' : 'LIVENESS_FAILED',
    message: passed
      ? 'Liveness terpenuhi.'
      : challenge === 'close_eyes'
        ? 'Mata tidak terlihat tertutup. Ulangi dan tutup mata lebih lama.'
        : 'Kedipan tidak terdeteksi. Ulangi dan kedip dua kali.',
    detected: detected.length,
    blinks: transitions,
    longest_closed: longestClosed,
  };
}

/** Metrik kualitas saja (dipakai kalibrasi & test). */
async function assessImage(buffer) {
  const prepared = await prepare(buffer);
  return {
    width: prepared.width,
    height: prepared.height,
    mean: Math.round(prepared.mean),
    contrast: Math.round(prepared.contrast),
    sharpness: Math.round(prepared.sharpness),
  };
}

module.exports = {
  FaceError,
  loadFaceApi,
  decodeDataUrl,
  assessImage,
  detectFace,
  analyzeLiveness,
  meanDescriptor,
  euclideanDistance,
  toVectorLiteral,
  parseVector,
  EYE_CLOSED_EAR,
};
