/**
 * DEV UTILITY — export a decrypted copy of the Sourcerer SQLite database.
 *
 * Usage:
 *   node scripts/export-plain-db.js [output-path]
 *
 * If output-path is omitted, the file is written to the current directory as
 * sourcerer-plain.db. DO NOT commit or share the output file — it contains
 * all source data in plaintext.
 *
 * Prerequisites: run `npm run rebuild:node` once after cloning so that argon2
 * and better-sqlite3-multiple-ciphers are built for the current Node version.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const argon2 = require('argon2');
const Database = require('better-sqlite3-multiple-ciphers');

// Mirrors app.getPath('userData') for the Electron app on each platform.
function getUserDataPath() {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'sourcerer');
    case 'win32':
      return path.join(process.env.APPDATA || os.homedir(), 'sourcerer');
    default:
      return path.join(os.homedir(), '.config', 'sourcerer');
  }
}

async function promptPassword() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Suppress echoing on interactive TTYs.
  rl._writeToOutput = (s) => {
    if (!rl.stdoutMuted) rl.output.write(s);
  };
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdout.write('Password: ');
      rl.stdoutMuted = true;
    }
    rl.question('', (answer) => {
      rl.close();
      if (process.stdin.isTTY) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function deriveKey(password, salt) {
  const rawKey = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
    salt,
    raw: true,
  });
  return rawKey.toString('hex');
}

// Validate the output path to prevent SQL injection in the VACUUM INTO statement.
// Allows alphanumeric characters, path separators, dots, hyphens, and underscores.
function validateOutputPath(p) {
  if (/['"`;\\]/.test(p)) {
    throw new Error(`Output path contains disallowed characters: ${p}`);
  }
  return p;
}

async function main() {
  const userData = getUserDataPath();
  const dbPath = path.join(userData, 'sourcerer.db');
  const saltPath = path.join(userData, 'sourcerer.salt');
  const outPath = validateOutputPath(path.resolve(process.argv[2] || 'sourcerer-plain.db'));

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at: ${dbPath}`);
    console.error('Run the Sourcerer app at least once to create the database.');
    process.exit(1);
  }

  if (!fs.existsSync(saltPath)) {
    console.error(`Salt file not found at: ${saltPath}`);
    process.exit(1);
  }

  if (fs.existsSync(outPath)) {
    console.error(`Output file already exists: ${outPath}`);
    console.error('Delete it first or choose a different path.');
    process.exit(1);
  }

  const salt = fs.readFileSync(saltPath);
  const password = await promptPassword();

  let keyHex;
  try {
    keyHex = await deriveKey(password, salt);
  } catch (err) {
    console.error('Key derivation failed:', err.message);
    process.exit(1);
  }

  let db;
  try {
    db = new Database(dbPath);
    db.pragma(`cipher='sqlcipher'`);
    db.pragma('cipher_page_size=4096');
    db.pragma('kdf_iter=256000');
    db.pragma('cipher_hmac_algorithm=HMAC_SHA512');
    db.pragma('cipher_kdf_algorithm=PBKDF2_HMAC_SHA512');
    db.pragma(`key="x'${keyHex}'"`);
    // Verify the key works before attempting export.
    db.pragma('user_version');
  } catch {
    console.error('Could not open database — wrong password or corrupted file.');
    process.exit(1);
  }

  try {
    // VACUUM INTO writes a defragmented, unencrypted copy of the database.
    // outPath is validated above to contain no SQL metacharacters.
    db.prepare(`VACUUM INTO '${outPath}'`).run();
  } finally {
    db.close();
  }

  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nExported to: ${outPath} (${sizeMB} MB)`);
  console.log('Open in TablePlus, DB Browser, or: sqlite3 ' + outPath);
  console.log('\nRemember to delete this file when you are done.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
