/**
 * The diagnostics report: one Markdown file, safe to attach to a public issue,
 * that works whether the vault is locked or unlocked.
 *
 * Like the trace (./trace.ts), it is **built from an allowlist, never by
 * filtering**: `gatherReport` reads a fixed list of facts and turns each into a
 * number, a yes/no, or a word from a fixed list, and `renderReport` writes only
 * those. No path, file name, error message or anything stored in the vault is
 * read into it. The app shows the rendered text in full before it is saved.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import Database from 'better-sqlite3-multiple-ciphers';
import argon2 from 'argon2';
import { is } from '@electron-toolkit/utils';
import { getPaths, getVaultBundlePath, detectSyncProvider, filenameDateStamp } from '../utils';
import { DB_VERSION, getDatabase, isDatabaseOpen } from '../database';
import { errorFacts, readTrace, type ErrorFacts, type TraceEntry, type UnlockStage, type ErrorCategory } from './trace';

export const REPORT_FORMAT = 1;

const SYNC_PROVIDERS = new Set(['iCloud Drive', 'OneDrive', 'Google Drive', 'Dropbox', 'Box']);
const VERSION = /^\d+\.\d+\.\d+(?:-[\w.]{1,20})?$/;
const VERSION_LOOSE = /^[\w.+-]{1,40}$/;

type Probe = { ok: true; detail?: string } | { ok: false; error: ErrorFacts };

export interface ReportData {
  createdAt: string; // UTC to the minute
  app: { version: string; build: 'installed' | 'development'; vault: 'locked' | 'unlocked' };
  system: {
    platform: string;
    osVersion: string;
    kernel: string;
    cpuArch: string;
    appArch: string;
    translated: boolean | null;
    electron: string;
    chrome: string;
    node: string;
    moduleVersion: string;
  };
  components: { database: Probe; keyDerivation: Probe };
  vault: {
    /** default: <userData>/Vault.sourcerer (setup's "Use default location");
     *  chosen: any other folder; legacy: no vault config, files loose in userData. */
    location: 'default' | 'chosen' | 'legacy';
    syncService: string; // a SYNC_PROVIDERS word or 'none detected'
    database: 'missing' | string; // a size bucket
    keyFile: 'missing' | 'expected size' | 'unexpected size';
    leftoverKeyFile: boolean;
    journal: boolean;
    schemaVersion: number | null; // null while locked
    expectedSchemaVersion: number;
  };
  trace: TraceEntry[];
}

// ── gathering ────────────────────────────────────────────────────────────────

function safe(value: unknown, pattern: RegExp, fallback = 'unknown'): string {
  return typeof value === 'string' && pattern.test(value) ? value : fallback;
}

const SIZE_BUCKETS: [number, string][] = [
  [4096, 'under 4 KB (the size of a sync placeholder)'],
  [1024 ** 2, '4 KB to 1 MB'],
  [10 * 1024 ** 2, '1 to 10 MB'],
  [100 * 1024 ** 2, '10 to 100 MB'],
  [1024 ** 3, '100 MB to 1 GB'],
];

export function sizeBucket(bytes: number): string {
  for (const [limit, label] of SIZE_BUCKETS) if (bytes < limit) return label;
  return 'over 1 GB';
}

function stat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/** File facts for a vault at these paths; exported for tests. */
export function vaultFileFacts(dbPath: string, saltPath: string): Pick<ReportData['vault'], 'database' | 'keyFile' | 'leftoverKeyFile' | 'journal'> {
  const db = stat(dbPath);
  const salt = stat(saltPath);
  return {
    database: db ? sizeBucket(db.size) : 'missing',
    keyFile: !salt ? 'missing' : salt.size === 32 ? 'expected size' : 'unexpected size',
    leftoverKeyFile: stat(saltPath + '.tmp') !== null,
    journal: stat(dbPath + '-journal') !== null || stat(dbPath + '-wal') !== null,
  };
}

function probeDatabase(): Probe {
  try {
    const db = new Database(':memory:');
    try {
      const sqlite = safe(db.prepare('SELECT sqlite_version() AS v').pluck().get(), VERSION_LOOSE);
      let mc = 'unknown';
      try {
        mc = safe(db.prepare('SELECT sqlite3mc_version() AS v').pluck().get(), /^[\w. ]{1,60}$/);
      } catch {
        /* function not present in this build */
      }
      return { ok: true, detail: `SQLite ${sqlite}; ${mc}` };
    } finally {
      db.close();
    }
  } catch (err) {
    return { ok: false, error: errorFacts(err) };
  }
}

async function probeKeyDerivation(): Promise<Probe> {
  try {
    await argon2.hash('diagnostics-probe', {
      type: argon2.argon2id,
      memoryCost: 1024,
      timeCost: 2, // the library minimum
      parallelism: 1,
      hashLength: 16,
      salt: crypto.randomBytes(16),
      raw: true,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorFacts(err) };
  }
}

function schemaVersion(): number | null {
  if (!isDatabaseOpen()) return null;
  try {
    const v = getDatabase().pragma('user_version', { simple: true });
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

function osVersion(): string {
  const getSystemVersion = (process as unknown as { getSystemVersion?: () => string }).getSystemVersion;
  return safe(getSystemVersion?.(), VERSION_LOOSE);
}

function minuteStamp(d: Date): string {
  return d.toISOString().slice(0, 16) + 'Z';
}

export async function gatherReport(now: Date = new Date()): Promise<ReportData> {
  const { dbPath, saltPath } = getPaths();
  const bundlePath = getVaultBundlePath();
  const provider = bundlePath ? detectSyncProvider(bundlePath) : null;
  const translated = (app as unknown as { runningUnderARM64Translation?: boolean }).runningUnderARM64Translation;
  return {
    createdAt: minuteStamp(now),
    app: {
      version: safe(app.getVersion(), VERSION),
      build: is.dev || !app.isPackaged ? 'development' : 'installed',
      vault: isDatabaseOpen() ? 'unlocked' : 'locked',
    },
    system: {
      platform: safe(process.platform, /^[a-z0-9]{1,20}$/),
      osVersion: osVersion(),
      kernel: safe(os.release(), VERSION_LOOSE),
      cpuArch: safe(os.arch(), /^[a-z0-9_]{1,12}$/),
      appArch: safe(process.arch, /^[a-z0-9_]{1,12}$/),
      translated: typeof translated === 'boolean' ? translated : null,
      electron: safe(process.versions.electron, VERSION_LOOSE),
      chrome: safe(process.versions.chrome, VERSION_LOOSE),
      node: safe(process.versions.node, VERSION_LOOSE),
      moduleVersion: safe(process.versions.modules, /^\d{1,4}$/),
    },
    components: { database: probeDatabase(), keyDerivation: await probeKeyDerivation() },
    vault: {
      location: !bundlePath
        ? 'legacy'
        : path.resolve(bundlePath) === path.resolve(app.getPath('userData'), 'Vault.sourcerer')
          ? 'default'
          : 'chosen',
      syncService: provider && SYNC_PROVIDERS.has(provider) ? provider : 'none detected',
      ...vaultFileFacts(dbPath, saltPath),
      schemaVersion: schemaVersion(),
      expectedSchemaVersion: DB_VERSION,
    },
    trace: readTrace(),
  };
}

// ── Markdown ─────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<TraceEntry['event'], string> = {
  'app-started': 'App started',
  'unlock-succeeded': 'Unlocked',
  'unlock-wrong-password': 'Unlock refused: wrong password',
  'unlock-vault-files-problem': 'Unlock stopped: problem with the vault files',
  'unlock-failed': 'Unlock failed',
  'uncaught-exception': 'Uncaught error in the main process',
  'renderer-gone': 'Window process ended',
  'child-process-gone': 'Helper process ended',
};

const STAGE_LABELS: Record<UnlockStage, string> = {
  'read-key-file': 'reading the key file',
  'derive-key': 'deriving the key from the password',
  'open-database': 'opening the database',
  migrate: 'updating the database to this version',
  'start-session': 'starting the session after the database opened',
};

const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  'wrong-key': 'the key was rejected',
  'native-module-version': 'a native module was built for a different Node/Electron version',
  'native-module-architecture': 'a native module was built for a different CPU architecture',
  'native-module-missing': 'a native module file is missing',
  'native-module-load': 'a native module failed to load',
  'module-missing': 'a module is missing',
  migration: 'a database migration failed',
  sqlite: 'a database error',
  'file-missing': 'a file was not found',
  'file-permission': 'permission was denied',
  'disk-full': 'the disk is full',
  other: 'an unexpected error',
};

const LOCATION_LABELS: Record<ReportData['vault']['location'], string> = {
  default: 'the default location',
  chosen: 'a folder chosen during setup or moved to later',
  legacy: "loose files in the app's data folder (the layout of early versions)",
};

function utc(stamp: string): string {
  return stamp.replace('T', ' ').replace(/Z$/, ' UTC');
}

function describeFacts(f: Omit<ErrorFacts, 'original'>): string {
  const parts = [CATEGORY_LABELS[f.category]];
  if (f.abi) parts.push(`built for module version ${f.abi.built}, this app needs ${f.abi.required}`);
  if (f.arch) parts.push(`built for ${f.arch.have}, this app needs ${f.arch.need}`);
  parts.push(f.code ? `${f.type}, code ${f.code}` : f.type);
  return parts.join('; ');
}

function errorLines(f: ErrorFacts, pad: string): string[] {
  const out = [`${pad}- Error: ${describeFacts(f)}`];
  if (f.original) out.push(`${pad}- Caused by: ${describeFacts(f.original)}`);
  const frames = f.original?.frames.length ? f.original.frames : f.frames;
  if (frames.length) {
    out.push(`${pad}- Stack:`);
    for (const fr of frames) out.push(`${pad}  - \`${fr}\``);
  }
  return out;
}

function probeLine(label: string, p: Probe): string[] {
  if (p.ok) return [`- ${label}: works${p.detail ? ` (${p.detail})` : ''}`];
  return [`- ${label}: does not work`, ...errorLines(p.error, '  ')];
}

function yesNo(b: boolean): string {
  return b ? 'yes' : 'no';
}

export function renderReport(r: ReportData): string {
  const s = r.system;
  const v = r.vault;
  const out: string[] = [
    '# Sourcerer diagnostics report',
    '',
    'Facts about this copy of Sourcerer and a list of recent events, to help debug a problem. ' +
      'It never holds your password or keys, anything stored in your vault (names, email addresses, ' +
      'notes, projects), file or folder names, or the text of error messages. Read it before you share it.',
    '',
    `- Created: ${utc(r.createdAt)}`,
    `- Report format: ${REPORT_FORMAT}`,
    '',
    '## App',
    '',
    `- Version: ${r.app.version}`,
    `- Build: ${r.app.build}`,
    `- Vault: ${r.app.vault}`,
    '',
    '## System',
    '',
    `- Platform: ${s.platform}, version ${s.osVersion}` + (s.kernel !== s.osVersion ? ` (kernel ${s.kernel})` : ''),
    `- CPU architecture: ${s.cpuArch}; app built for ${s.appArch}` +
      (s.translated === null ? '' : `; running under translation: ${yesNo(s.translated)}`),
    `- Electron ${s.electron}, Chromium ${s.chrome}, Node ${s.node}`,
    `- Node module version: ${s.moduleVersion}`,
    '',
    '## Components',
    '',
    ...probeLine('Database engine', r.components.database),
    ...probeLine('Key derivation (Argon2)', r.components.keyDerivation),
    // Node reports a native module's real problem only on the first try to load
    // it; later tries in the same session say only "did not self-register".
    ...(!r.components.database.ok || !r.components.keyDerivation.ok
      ? ['', 'A module that has already failed once in this session gives a less specific error here; the first failure is under Recent events.']
      : []),
    '',
    '## Vault files',
    '',
    `- Location: ${LOCATION_LABELS[v.location]}`,
    `- Sync service: ${v.syncService}`,
    `- Database file: ${v.database === 'missing' ? 'missing' : `present, ${v.database}`}`,
    `- Key file: ${v.keyFile === 'missing' ? 'missing' : `present, ${v.keyFile}`}`,
    `- Key file left by an unfinished password change: ${yesNo(v.leftoverKeyFile)}`,
    `- Database journal file: ${v.journal ? 'present' : 'none'}`,
    `- Database version: ${v.schemaVersion === null ? 'not readable while locked' : v.schemaVersion} (this app expects ${v.expectedSchemaVersion})`,
    '',
    '## Recent events',
    '',
  ];
  if (r.trace.length === 0) {
    out.push('- none recorded');
  } else {
    out.push(`The last ${r.trace.length} recorded, oldest first. Times are UTC.`, '');
    for (const e of r.trace) {
      const bits = [EVENT_LABELS[e.event]];
      if (e.version) bits.push(`version ${e.version}${e.build ? `, ${e.build}` : ''}`);
      if (e.stage) bits.push(`while ${STAGE_LABELS[e.stage]}`);
      if (e.detail) bits.push(e.detail);
      out.push(`- ${utc(e.at)} · ${bits.join(' · ')}`);
      if (e.error) out.push(...errorLines(e.error, '  '));
    }
  }
  return out.join('\n') + '\n';
}

/** Named by time alone. */
export function reportFileName(): string {
  return `sourcerer-diagnostics-${filenameDateStamp()}.md`;
}
