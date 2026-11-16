// ai-excited-01 entry v4 (Node 22, standard library only).
//
// The entry is the image beside this file: a colossal humpback whale
// breaching vertically out of a stormy sea at golden dusk, its body
// silhouetted against a blazing molten-gold sun, a crown of spray bursting
// around it, god-rays piercing the clouds, and a tiny wooden sailboat below
// for scale — one frozen moment of awe, momentum and craft, made to excite
// make.fun's AI judge.
//
// The program validates the image against the competition gate (a whole PNG
// or JPEG of at most 1 MiB and 1024 by 1024 pixels) and copies it, byte for
// byte, to /output/entry.png, verifying the copy by SHA-256. Outside the
// grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// v4 adds, over v3: a full PNG chunk walk that checks every chunk's CRC-32
// and that IHDR is first, IEND is last and nothing trails it (v3 only
// looked for IEND at the tail); a JPEG end-of-image (EOI) check, so a
// truncated JPEG no longer slips through; a per-check report, so --json and
// the human summary both show exactly which gate passed; and a sanity
// check on the PNG colour type and bit depth from IHDR.

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
// A complete JPEG ends with its 2-byte EOI marker.
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

const USAGE = `usage: node main.ts [--check] [--json] [--help]

Validates entry.png (a whole PNG or JPEG, at most 1 MiB and 1024x1024 pixels)
and copies it byte for byte to $MAKEFUN_OUTPUT_DIR/entry.png (default /output),
verifying the copy by SHA-256.

  --check   validate only, write nothing, exit 0 when the image passes
  --json    print the result as one JSON object instead of a human summary
  --help    show this help`;

// --- CRC-32 (PNG chunk checksums), built once from the standard polynomial.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
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

// Walk every PNG chunk from the signature onward. Returns the IHDR
// dimensions plus the number of chunks walked, or throws on the first
// structural fault: a chunk that overruns the file, a bad CRC, a missing
// or misplaced IHDR/IEND, or bytes trailing the IEND chunk.
function validatePngChunks(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG: bad signature');
  }
  let offset = 8;
  let chunks = 0;
  let dimensions = null;
  let sawIend = false;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw new Error(`PNG chunk ${type} overruns the end of the file`);
    }
    const storedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = crc32(bytes.subarray(offset + 4, dataEnd));
    if (storedCrc !== actualCrc) {
      throw new Error(`PNG chunk ${type} has a bad CRC`);
    }
    if (chunks === 0 && type !== 'IHDR') {
      throw new Error(`first PNG chunk is ${type}, not IHDR`);
    }
    if (type === 'IHDR') {
      if (length !== 13) throw new Error('PNG IHDR chunk is not 13 bytes');
      dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      const bitDepth = bytes[24];
      const colourType = bytes[25];
      const validDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!validDepths[colourType]?.includes(bitDepth)) {
        throw new Error(`PNG IHDR has unsupported bit depth ${bitDepth} / colour type ${colourType}`);
      }
    }
    if (type === 'IEND') {
      if (length !== 0) throw new Error('PNG IEND chunk is not empty');
      if (dataEnd + 4 !== bytes.length) {
        throw new Error('bytes trail the PNG IEND chunk');
      }
      sawIend = true;
    }
    chunks += 1;
    offset = dataEnd + 4;
    if (sawIend) break;
  }
  if (!sawIend) throw new Error('PNG has no IEND chunk: the file is truncated');
  if (!dimensions) throw new Error('PNG has no IHDR chunk');
  return { dimensions, chunks };
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

// A JPEG is only whole if it ends with its EOI marker.
function jpegHasEoi(bytes) {
  return bytes.length >= 2 && bytes.subarray(bytes.length - 2).equals(JPEG_EOI);
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(USAGE);
    return;
  }

  const checks = [];
  const check = (name, detail) => checks.push({ name, ok: true, detail });
  const source = fileURLToPath(new URL('./entry.png', import.meta.url));
  if (!existsSync(source)) fail(`entry image not found: ${source}`);

  const bytes = readFileSync(source);
  const size = statSync(source).size;
  if (size === 0) fail('entry.png is empty');
  check('non-empty', `${size} bytes`);
  if (size > MAX_BYTES) fail(`entry.png is ${size} bytes, over the 1 MiB gate`);
  check('at most 1 MiB', `${size} <= ${MAX_BYTES}`);
  if (size !== bytes.length) fail('entry.png changed while reading it');

  const isPng = bytes.subarray(0, 8).equals(PNG_SIGNATURE);
  const isJpeg = bytes.subarray(0, 3).equals(JPEG_SIGNATURE);
  if (!isPng && !isJpeg) fail('entry.png is neither a PNG nor a JPEG');
  const format = isPng ? 'PNG' : 'JPEG';
  check('format', format);

  let dimensions;
  let extra = '';
  if (isPng) {
    let walked;
    try {
      walked = validatePngChunks(bytes);
    } catch (err) {
      fail(`entry.png failed PNG validation: ${err.message}`);
    }
    dimensions = walked.dimensions;
    check('whole PNG', `${walked.chunks} chunks, every CRC valid, IEND last`);
    extra = `, ${walked.chunks} chunks`;
  } else {
    if (!jpegHasEoi(bytes)) {
      fail('entry.png is a truncated JPEG: no EOI marker at the end of the file');
    }
    check('whole JPEG', 'EOI marker present');
    dimensions = jpegDimensions(bytes);
    if (!dimensions) fail('entry.png has no readable JPEG dimensions');
  }

  if (dimensions.width === 0 || dimensions.height === 0) {
    fail(`entry.png has zero ${format} dimensions`);
  }
  check('non-zero dimensions', `${dimensions.width}x${dimensions.height}`);
  if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
    fail(`entry.png is ${dimensions.width}x${dimensions.height}, over the 1024x1024 gate`);
  }
  check('at most 1024x1024', `${dimensions.width}x${dimensions.height}`);

  const summary = {
    format,
    width: dimensions.width,
    height: dimensions.height,
    bytes: size,
    sha256: sha256(bytes),
    checks,
  };

  if (flags.check) {
    if (flags.json) console.log(JSON.stringify({ ok: true, ...summary }));
    else {
      console.log(
        `ok: entry.png is a valid ${format} ${dimensions.width}x${dimensions.height}, ` +
          `${size} bytes, sha256 ${summary.sha256.slice(0, 12)}… (${checks.length} checks passed${extra})`,
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
  check('copy verified', `SHA-256 matches at ${target}`);

  if (flags.json) {
    console.log(JSON.stringify({ ok: true, target, ...summary }));
  } else {
    console.log(
      `wrote ${target} (${size} bytes, ${format} ${dimensions.width}x${dimensions.height}, ` +
        `sha256 ${summary.sha256.slice(0, 12)}…, ${checks.length} checks passed)`,
    );
  }
}

main();
