#!/usr/bin/env node
'use strict';

/**
 * Generates build/icon.png, the source image electron-builder converts into
 * a macOS .icns, a Windows .ico and Linux PNGs.
 *
 * It is written by hand with zlib rather than pulled from an image library so
 * the project keeps exactly two devDependencies and the icon can be
 * regenerated on any machine with nothing but Node installed.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 1024;
const OUTPUT = path.join(__dirname, '..', 'build', 'icon.png');

// ---- Geometry helpers -------------------------------------------------------

/** Distance from a point to a line segment; used to draw round-capped strokes. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance to a rounded rectangle; negative inside. */
function distanceToRoundedRect(px, py, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(px, right - radius));
  const cy = Math.max(top + radius, Math.min(py, bottom - radius));
  return Math.hypot(px - cx, py - cy) - radius;
}

/** 1 inside the shape, 0 outside, blended smoothly across one pixel. */
function coverage(distance) {
  return Math.max(0, Math.min(1, 0.5 - distance));
}

function blend(target, offset, r, g, b, alpha) {
  if (alpha <= 0) return;
  const inverse = 1 - alpha;
  target[offset] = Math.round(r * alpha + target[offset] * inverse);
  target[offset + 1] = Math.round(g * alpha + target[offset + 1] * inverse);
  target[offset + 2] = Math.round(b * alpha + target[offset + 2] * inverse);
  target[offset + 3] = Math.round(255 * alpha + target[offset + 3] * inverse);
}

// ---- Draw -------------------------------------------------------------------

const pixels = Buffer.alloc(SIZE * SIZE * 4, 0);

const MARGIN = 62;
const RADIUS = 208;
const STROKE = 44;

// A chevron and an underscore, echoing a shell prompt.
const CHEVRON = [
  [352, 356, 548, 512],
  [548, 512, 352, 668],
];
const UNDERSCORE = [600, 690, 742, 690];

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const offset = (y * SIZE + x) * 4;

    // Body: a vertical gradient between two Tokyo Night tones.
    const bodyDistance = distanceToRoundedRect(
      x,
      y,
      MARGIN,
      MARGIN,
      SIZE - MARGIN,
      SIZE - MARGIN,
      RADIUS
    );
    const bodyAlpha = coverage(bodyDistance);
    if (bodyAlpha > 0) {
      const t = y / SIZE;
      blend(
        pixels,
        offset,
        Math.round(26 + (41 - 26) * t),
        Math.round(27 + (46 - 27) * t),
        Math.round(38 + (66 - 38) * t),
        bodyAlpha
      );
    }

    // A hairline inner edge lifts the icon off dark backgrounds.
    const edge = Math.abs(bodyDistance + 3);
    if (edge < 2.2) blend(pixels, offset, 122, 162, 247, (1 - edge / 2.2) * 0.32);

    let chevronDistance = Infinity;
    for (const segment of CHEVRON) {
      chevronDistance = Math.min(
        chevronDistance,
        distanceToSegment(x, y, segment[0], segment[1], segment[2], segment[3])
      );
    }
    blend(pixels, offset, 122, 162, 247, coverage(chevronDistance - STROKE / 2));

    const underscoreDistance = distanceToSegment(
      x,
      y,
      UNDERSCORE[0],
      UNDERSCORE[1],
      UNDERSCORE[2],
      UNDERSCORE[3]
    );
    blend(pixels, offset, 158, 206, 106, coverage(underscoreDistance - STROKE / 2));
  }
}

// ---- Encode as PNG ----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // colour type: RGBA
header[10] = 0; // deflate
header[11] = 0; // adaptive filtering
header[12] = 0; // no interlace

// Each scanline is prefixed with its filter type; 0 means "none".
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y += 1) {
  const source = y * SIZE * 4;
  const target = y * (SIZE * 4 + 1);
  raw[target] = 0;
  pixels.copy(raw, target + 1, source, source + SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, png);
process.stdout.write('wrote ' + OUTPUT + ' (' + SIZE + 'x' + SIZE + ', ' + png.length + ' bytes)\n');
