'use strict';

// Utility sekali pakai: menghasilkan aset PNG tanpa dependency tambahan.
// Jalankan: node scripts/generate-assets.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.resolve(__dirname, '../assets');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(file, width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(file, png);
  console.log(`${path.basename(file)} ${width}x${height} ${png.length} bytes`);
}

function parseHex(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function insideCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function insideTriangle(px, py, a, b, c) {
  const sign = (p1, p2, p3) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign([px, py], a, b);
  const d2 = sign([px, py], b, c);
  const d3 = sign([px, py], c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function render(width, height, paint, supersample = 2) {
  const scale = supersample;
  const hiW = width * scale;
  const hiH = height * scale;
  const hiBuffer = Buffer.alloc(hiW * hiH * 4);
  for (let y = 0; y < hiH; y += 1) {
    for (let x = 0; x < hiW; x += 1) {
      const [r, g, b, a] = paint(x / hiW, y / hiH);
      const i = (y * hiW + x) * 4;
      hiBuffer[i] = r;
      hiBuffer[i + 1] = g;
      hiBuffer[i + 2] = b;
      hiBuffer[i + 3] = a;
    }
  }

  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const i = ((y * scale + sy) * hiW + (x * scale + sx)) * 4;
          r += hiBuffer[i];
          g += hiBuffer[i + 1];
          b += hiBuffer[i + 2];
          a += hiBuffer[i + 3];
        }
      }
      const total = scale * scale;
      const o = (y * width + x) * 4;
      out[o] = Math.round(r / total);
      out[o + 1] = Math.round(g / total);
      out[o + 2] = Math.round(b / total);
      out[o + 3] = Math.round(a / total);
    }
  }
  return out;
}

const DARK = parseHex('#0B1220');
const TEAL = parseHex('#0F766E');
const WHITE = [255, 255, 255];

function pinPaint({ background, pinScale = 1, offsetY = 0 }) {
  return (u, v) => {
    const cx = 0.5;
    const cy = 0.44 + offsetY;
    const scale = pinScale;

    if (background) {
      return [...background, 255];
    }

    const head = insideCircle(u, v, cx, cy, 0.18 * scale);
    const tip = insideTriangle(
      u,
      v,
      [cx - 0.125 * scale, cy + 0.04 * scale],
      [cx + 0.125 * scale, cy + 0.04 * scale],
      [cx, cy + 0.3 * scale]
    );
    if (!head && !tip) return [0, 0, 0, 0];

    if (insideCircle(u, v, cx, cy, 0.075 * scale)) return [...TEAL, 255];
    return [...WHITE, 255];
  };
}

const icon = render(1024, 1024, pinPaint({ background: DARK }));
writePng(path.join(OUT, 'icon.png'), 1024, 1024, icon);

const adaptive = render(1024, 1024, pinPaint({ background: null, pinScale: 0.72, offsetY: 0.02 }));
writePng(path.join(OUT, 'adaptive-icon.png'), 1024, 1024, adaptive);

const splash = render(
  1284,
  2778,
  (u, v) => {
    const cx = 0.5;
    const cy = 0.47;
    const width = 0.08;
    const height = 0.135;
    const head = insideCircle(u, v, cx, cy, height * 0.68);
    const tip = insideTriangle(
      u,
      v,
      [cx - width * 0.62, cy + height * 0.14],
      [cx + width * 0.62, cy + height * 0.14],
      [cx, cy + height * 0.95]
    );
    if (!head && !tip) return [...DARK, 255];
    if (insideCircle(u, v, cx, cy, height * 0.28)) return [...TEAL, 255];
    return [...WHITE, 255];
  },
  1
);
writePng(path.join(OUT, 'splash.png'), 1284, 2778, splash);

const favicon = render(64, 64, pinPaint({ background: DARK }), 4);
writePng(path.join(OUT, 'favicon.png'), 64, 64, favicon);
