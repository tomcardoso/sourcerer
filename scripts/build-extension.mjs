#!/usr/bin/env node
/**
 * Build script for the Sourcerer browser extension.
 *
 * Produces:
 *   dist-extension/sourcerer-chrome-<version>.zip   (Chrome Web Store submission)
 *   dist-extension/sourcerer-firefox-<version>.zip  (Firefox Add-ons submission)
 *
 * The two zips are identical except for the manifest:
 *   - Chrome  uses extension/manifest.json
 *   - Firefox uses extension/manifest.firefox.json (adds browser_specific_settings)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Minimal zip builder (no external dependencies)
// ---------------------------------------------------------------------------

// CRC-32 lookup table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}

function u16le(v) { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(v, 0); return b; }
function u32le(v) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(v, 0); return b; }

/**
 * Build a zip archive in memory from a list of { path, data } entries.
 * Returns a Buffer with the complete zip file.
 */
function buildZip(entries) {
  const localHeaders = [];
  const centralDirs = [];
  let offset = 0;
  const { date: dosDate, time: dosTime } = dosDateTime();

  for (const { path: entryPath, data } of entries) {
    const name = Buffer.from(entryPath);
    const crc = crc32(data);
    const size = data.length;

    // Local file header (signature 0x04034b50)
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      u16le(20),        // version needed
      u16le(0),         // general purpose bit flag
      u16le(0),         // compression: stored
      u16le(dosTime),
      u16le(dosDate),
      u32le(crc),
      u32le(size),      // compressed size
      u32le(size),      // uncompressed size
      u16le(name.length),
      u16le(0),         // extra field length
      name,
      data,
    ]);

    localHeaders.push(local);

    // Central directory entry (signature 0x02014b50)
    centralDirs.push(Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      u16le(20),        // version made by
      u16le(20),        // version needed
      u16le(0),         // flags
      u16le(0),         // compression: stored
      u16le(dosTime),
      u16le(dosDate),
      u32le(crc),
      u32le(size),
      u32le(size),
      u16le(name.length),
      u16le(0),         // extra
      u16le(0),         // comment
      u16le(0),         // disk start
      u16le(0),         // internal attr
      u32le(0),         // external attr
      u32le(offset),    // local header offset
      name,
    ]));

    offset += local.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralDirs);
  const centralSize = centralBuf.length;

  // End of central directory record (signature 0x06054b50)
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16le(0),                        // disk number
    u16le(0),                        // disk with central dir
    u16le(entries.length),
    u16le(entries.length),
    u32le(centralSize),
    u32le(centralStart),
    u16le(0),                        // comment length
  ]);

  return Buffer.concat([...localHeaders, centralBuf, eocd]);
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

const EXT_DIR = resolve(import.meta.dirname, '..', 'extension');
const OUT_DIR = resolve(import.meta.dirname, '..', 'dist-extension');

/** Files to always exclude from the zip */
const EXCLUDE = new Set([
  'manifest.firefox.json',
  'fonts/download_fonts.py',
]);

function collectFiles(dir, root = dir) {
  const results = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = relative(root, abs);
    if (EXCLUDE.has(rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      results.push(...collectFiles(abs, root));
    } else {
      results.push({ path: rel, data: readFileSync(abs) });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf8'));
const version = manifest.version ?? pkg.version;

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

// Collect all extension files (common to both browsers)
const baseFiles = collectFiles(EXT_DIR);

// ── Chrome zip ──────────────────────────────────────────────────────────────
const chromeEntries = baseFiles; // uses manifest.json as-is
const chromeZip = buildZip(chromeEntries);
const chromeOut = join(OUT_DIR, `sourcerer-chrome-${version}.zip`);
await import('node:fs/promises').then(({ writeFile }) => writeFile(chromeOut, chromeZip));
console.log(`✓ Chrome: ${chromeOut} (${(chromeZip.length / 1024).toFixed(1)} KB, ${chromeEntries.length} files)`);

// ── Firefox zip ─────────────────────────────────────────────────────────────
const firefoxManifestData = readFileSync(join(EXT_DIR, 'manifest.firefox.json'));
const firefoxEntries = baseFiles
  .filter(e => e.path !== 'manifest.json')
  .concat({ path: 'manifest.json', data: firefoxManifestData });
const firefoxZip = buildZip(firefoxEntries);
const firefoxOut = join(OUT_DIR, `sourcerer-firefox-${version}.zip`);
await import('node:fs/promises').then(({ writeFile }) => writeFile(firefoxOut, firefoxZip));
console.log(`✓ Firefox: ${firefoxOut} (${(firefoxZip.length / 1024).toFixed(1)} KB, ${firefoxEntries.length} files)`);

console.log('\nDone. Zips are in dist-extension/');
