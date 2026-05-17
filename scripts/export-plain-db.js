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
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Password: ', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    // Override AFTER question() has synchronously written the prompt, so the
    // prompt text renders but typed characters are not echoed.
    rl._writeToOutput = () => {};
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
  } catch (err) {
    console.error('Could not open database:', err.message);
    process.exit(1);
  }

  const plainDb = new Database(outPath);
  try {
    // sqlcipher_export() isn't available in the Node-built library, and
    // VACUUM INTO copies pages with encryption intact. Instead, open a fresh
    // unencrypted Database and copy schema + data at the JavaScript level.
    plainDb.prepare('PRAGMA foreign_keys = OFF').run();

    const tables = db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL"
    ).all();

    for (const { name, sql } of tables) {
      plainDb.prepare(sql).run();
      const rows = db.prepare(`SELECT * FROM "${name}"`).all();
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]).map(c => `"${c}"`).join(', ');
        const placeholders = Object.keys(rows[0]).map(() => '?').join(', ');
        const insert = plainDb.prepare(`INSERT INTO "${name}" (${cols}) VALUES (${placeholders})`);
        plainDb.transaction((rs) => { for (const r of rs) insert.run(Object.values(r)); })(rows);
      }
    }

    // Copy indexes, views, and triggers.
    const extras = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type IN ('index', 'view', 'trigger') AND sql IS NOT NULL"
    ).all();
    for (const { sql } of extras) {
      try { plainDb.prepare(sql).run(); } catch { /* skip anything that can't be recreated */ }
    }

    plainDb.prepare('PRAGMA foreign_keys = ON').run();
  } finally {
    plainDb.close();
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
