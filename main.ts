// ai-excited-01 entry (Node 22, standard library only).
//
// The entry is the image beside this file: a humpback whale breaching out of a
// stormy sea at golden dusk, a tiny sailboat below it for scale — one frozen
// moment of awe, momentum and craft, made to excite make.fun's AI judge.
//
// The program validates the image against the competition gate (a whole PNG or
// JPEG of at most 1 MiB and 1024 by 1024 pixels) and copies it, byte for byte,
// to /output/entry.png, verifying the copy by SHA-256. Outside the grader's
// container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1024 * 1024;
const MAX_DIMENSION = 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// Read a PNG's pixel dimensions from its IHDR chunk (bytes 16-23).
function pngDimensions(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function main() {
  const source = fileURLToPath(new URL('./entry.png', import.meta.url));
  if (!existsSync(source)) fail(`entry image not found: ${source}`);

  const bytes = readFileSync(source);
  const size = statSync(source).size;
  if (size > MAX_BYTES) fail(`entry.png is ${size} bytes, over the 1 MiB gate`);
  if (size !== bytes.length) fail('entry.png changed while reading it');

  const isPng = bytes.subarray(0, 8).equals(PNG_SIGNATURE);
  const isJpeg = bytes.subarray(0, 3).equals(JPEG_SIGNATURE);
  if (!isPng && !isJpeg) fail('entry.png is neither a PNG nor a JPEG');

  const dimensions = isPng ? pngDimensions(bytes) : null;
  if (isPng && !dimensions) fail('entry.png has no readable IHDR chunk');
  if (dimensions && (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION)) {
    fail(`entry.png is ${dimensions.width}x${dimensions.height}, over the 1024x1024 gate`);
  }

  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  mkdirSync(outDir, { recursive: true });
  const target = join(outDir, 'entry.png');
  copyFileSync(source, target);

  const copied = readFileSync(target);
  if (copied.length !== size) fail(`copied ${copied.length} bytes, expected ${size}`);
  if (sha256(copied) !== sha256(bytes)) fail('copy failed SHA-256 verification');

  const dims = dimensions ? `, ${dimensions.width}x${dimensions.height}` : '';
  console.log(`wrote ${target} (${size} bytes${dims}, ${isPng ? 'PNG' : 'JPEG'}, sha256 ${sha256(bytes).slice(0, 12)}…)`);
}

main();
