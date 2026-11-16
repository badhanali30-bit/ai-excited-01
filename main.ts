// ai-excited-01 entry v3 (Node 22, standard library only).
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
//
// v3 adds, over v2: JPEG dimension checks (v2 only gated PNG dimensions),
// a PNG IEND trailer check (a truncated PNG no longer slips through),
// an empty-file guard, a --check dry-run mode that validates without writing,
// and a --json mode that prints the result as one JSON object.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1024 * 1024;
const MAX_DIMENSION = 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
// A complete PNG ends with its 12-byte IEND chunk: length 0, "IEND", CRC ae426082.
const PNG_IEND = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const USAGE = `usage: node main.ts [--check] [--json] [--help]

Validates entry.png (a whole PNG or JPEG, at most 1 MiB and 1024x1024 pixels)
and copies it byte for byte to $MAKEFUN_OUTPUT_DIR/entry.png (default /output),
verifying the copy by SHA-256.

  --check   validate only, write nothing, exit 0 when the image passes
  --json    print the result as one JSON object instead of a human summary
  --help    show this help`;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseArgs(argv) {
  const flags = { check: false, json: false, help: false };
  for (const arg of argv) {
    if (arg === '--check') flags.check = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else fail(`unknown argument: ${arg}\n${USAGE}`);
  }
  return flags;
}

// Read a PNG's pixel dimensions from its IHDR chunk (bytes 16-23).
function pngDimensions(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// A PNG is only whole if it ends with its IEND chunk.
function pngHasIend(bytes) {
  return bytes.length >= PNG_IEND.length && bytes.subarray(bytes.length - PNG_IEND.length).equals(PNG_IEND);
}

// Read a JPEG's pixel dimensions from its first Start Of Frame marker
// (SOF0/SOF1/SOF2/SOF3/SOF5-SOF15, except the SOF4/DHT markers).
// Returns null when no SOF marker appears before the scan data.
function jpegDimensions(bytes) {
  if (bytes.length < 4 || !bytes.subarray(0, 3).equals(JPEG_SIGNATURE)) return null;
  let i = 2; // past the SOI marker
  while (i + 9 <= bytes.length) {
    if (bytes[i] !== 0xff) return null; // not a marker boundary
    const marker = bytes[i + 1];
    if (marker === 0xff) { i += 1; continue; } // fill byte before a marker
    // Standalone markers carry no length field.
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) return null;
    const length = bytes.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > bytes.length) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      // SOF segment: length(2), precision(1), height(2), width(2), components(1).
      if (length < 6) return null;
      return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
    }
    if (marker === 0xda) return null; // start of scan: no SOF before it
    i += 2 + length;
  }
  return null;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(USAGE);
    return;
  }

  const source = fileURLToPath(new URL('./entry.png', import.meta.url));
  if (!existsSync(source)) fail(`entry image not found: ${source}`);

  const bytes = readFileSync(source);
  const size = statSync(source).size;
  if (size === 0) fail('entry.png is empty');
  if (size > MAX_BYTES) fail(`entry.png is ${size} bytes, over the 1 MiB gate`);
  if (size !== bytes.length) fail('entry.png changed while reading it');

  const isPng = bytes.subarray(0, 8).equals(PNG_SIGNATURE);
  const isJpeg = bytes.subarray(0, 3).equals(JPEG_SIGNATURE);
  if (!isPng && !isJpeg) fail('entry.png is neither a PNG nor a JPEG');
  const format = isPng ? 'PNG' : 'JPEG';

  if (isPng && !pngHasIend(bytes)) {
    fail('entry.png is a truncated PNG: no IEND chunk at the end of the file');
  }

  const dimensions = isPng ? pngDimensions(bytes) : jpegDimensions(bytes);
  if (!dimensions) fail(`entry.png has no readable ${format} dimensions`);
  if (dimensions.width === 0 || dimensions.height === 0) {
    fail(`entry.png has zero ${format} dimensions`);
  }
  if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
    fail(`entry.png is ${dimensions.width}x${dimensions.height}, over the 1024x1024 gate`);
  }

  const summary = {
    format,
    width: dimensions.width,
    height: dimensions.height,
    bytes: size,
    sha256: sha256(bytes),
  };

  if (flags.check) {
    if (flags.json) console.log(JSON.stringify({ ok: true, ...summary }));
    else {
      console.log(
        `ok: entry.png is a valid ${format} ${dimensions.width}x${dimensions.height}, ` +
          `${size} bytes, sha256 ${summary.sha256.slice(0, 12)}…`,
      );
    }
    return;
  }

  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const target = join(outDir, 'entry.png');
  try {
    mkdirSync(outDir, { recursive: true });
    copyFileSync(source, target);
  } catch (err) {
    fail(`could not write ${target}: ${err.message}`);
  }

  const copied = readFileSync(target);
  if (copied.length !== size) fail(`copied ${copied.length} bytes, expected ${size}`);
  if (sha256(copied) !== summary.sha256) fail('copy failed SHA-256 verification');

  if (flags.json) {
    console.log(JSON.stringify({ ok: true, target, ...summary }));
  } else {
    console.log(
      `wrote ${target} (${size} bytes, ${format} ${dimensions.width}x${dimensions.height}, ` +
        `sha256 ${summary.sha256.slice(0, 12)}…)`,
    );
  }
}

main();
