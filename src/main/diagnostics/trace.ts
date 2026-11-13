/**
 * The diagnostics trace: a short record of recent app events (startups, unlock
 * outcomes, crashes) that the diagnostics report lists, so a problem can be
 * debugged after the fact without the vault's contents.
 *
 * **Every field is built from an allowlist, never by filtering text.** An event
 * is a word from `TRACE_EVENTS`; a stage, reason or category is a word from a
 * fixed list in this file; numbers are numbers. An error is reduced to facts
 * computed here (its class name from a fixed list, its library error code, a
 * category, and its stack frames reduced to code locations) and its message is
 * never stored: messages carry file paths with the account name in them, and
 * can carry whatever data the failing code was handling.
 *
 * The trace is kept as plain JSON in the app's own data folder, outside the
 * encrypted vault, which is why nothing in it may ever come from the vault.
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export const TRACE_EVENTS = [
  'app-started',
  'unlock-succeeded',
  'unlock-wrong-password',
  'unlock-vault-files-problem',
  'unlock-failed',
  'uncaught-exception',
  'renderer-gone',
  'child-process-gone',
] as const;
export type TraceEvent = (typeof TRACE_EVENTS)[number];

/** Where in unlocking a failure happened. */
export const UNLOCK_STAGES = [
  'read-key-file',
  'derive-key',
  'open-database',
  'migrate',
  'start-session',
] as const;
export type UnlockStage = (typeof UNLOCK_STAGES)[number];

/** Fixed words an event's `detail` can hold: vault file problems, Electron's
 *  render-process-gone / child-process-gone reasons and process types, and the
 *  origin Node gives an uncaught exception. Anything else is stored as 'other'. */
export const TRACE_DETAILS = [
  // vault file checks (unlock.ts checkVaultFiles)
  'database-missing',
  'key-file-missing',
  'database-placeholder',
  'key-file-placeholder',
  // Electron RenderProcessGoneDetails.reason
  'clean-exit',
  'abnormal-exit',
  'killed',
  'crashed',
  'oom',
  'launch-failed',
  'integrity-failure',
  'memory-eviction',
  // Electron child-process-gone types
  'Utility',
  'Zygote',
  'Sandbox helper',
  'GPU',
  'Pepper Plugin',
  'Pepper Plugin Broker',
  'Unknown',
  // Node uncaughtExceptionMonitor origin
  'uncaughtException',
  'unhandledRejection',
] as const;

export const ERROR_CATEGORIES = [
  'wrong-key',
  'native-module-version',
  'native-module-architecture',
  'native-module-missing',
  'native-module-load',
  'module-missing',
  'migration',
  'sqlite',
  'file-missing',
  'file-permission',
  'disk-full',
  'other',
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

const ERROR_TYPES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'EvalError',
  'URIError',
  'AggregateError',
  'SqliteError',
  'WrongKeyError',
  'MigrationError',
]);

const ARCHITECTURES = new Set(['x86_64', 'x64', 'arm64', 'arm64e', 'i386', 'ia32', 'arm']);

export interface ErrorFacts {
  category: ErrorCategory;
  /** The error's class name if it is one of ERROR_TYPES, else 'other'. */
  type: string;
  /** A library error code such as SQLITE_CANTOPEN, ENOENT or ERR_DLOPEN_FAILED. */
  code?: string;
  /** For native-module-version: the Node module ABI the binary was built for and the one this app runs. */
  abi?: { built: number; required: number };
  /** For native-module-architecture: the CPU architecture the binary has and the one needed. */
  arch?: { have: string; need: string };
  /** Up to MAX_FRAMES stack frames reduced to `function (code location:line:column)`. */
  frames: string[];
  /** For a migration failure: the facts of the error the migration threw. */
  original?: Omit<ErrorFacts, 'original'>;
}

export interface TraceEntry {
  /** UTC, to the minute: e.g. 2026-11-13T14:05Z */
  at: string;
  event: TraceEvent;
  stage?: UnlockStage;
  detail?: string;
  /** For app-started: the app version and whether it is an installed build. */
  version?: string;
  build?: 'installed' | 'development';
  error?: ErrorFacts;
}

export const MAX_ENTRIES = 100;
const MAX_FRAMES = 10;
const FILE_NAME = 'diagnostics-trace.json';

// ── error facts ──────────────────────────────────────────────────────────────

function str(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(code) ? code : undefined;
}

function errorType(err: unknown): string {
  const name = str((err as { name?: unknown } | null)?.name);
  return ERROR_TYPES.has(name) ? name : 'other';
}

/** Reads the category from the message, which is matched against known library
 *  wordings but never stored. */
function categorize(err: unknown, code: string | undefined, message: string): ErrorCategory {
  const name = str((err as { name?: unknown } | null)?.name);
  if (name === 'WrongKeyError') return 'wrong-key';
  if (name === 'MigrationError') return 'migration';
  if (/NODE_MODULE_VERSION/.test(message) || /compiled against a different Node\.js version/i.test(message)) {
    return 'native-module-version';
  }
  if (/incompatible architecture|wrong ELF class|not a valid Win32 application/i.test(message)) {
    return 'native-module-architecture';
  }
  if (/Could not locate the bindings file/i.test(message)) return 'native-module-missing';
  if (code === 'ERR_DLOPEN_FAILED') return 'native-module-load';
  if (code === 'MODULE_NOT_FOUND') return 'module-missing';
  if (code?.startsWith('SQLITE_')) return 'sqlite';
  if (code === 'ENOENT') return 'file-missing';
  if (code === 'EACCES' || code === 'EPERM') return 'file-permission';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'disk-full';
  return 'other';
}

function abiNumbers(message: string): { built: number; required: number } | undefined {
  const m = message.match(/NODE_MODULE_VERSION\s+(\d{1,4})\b[\s\S]*?NODE_MODULE_VERSION\s+(\d{1,4})\b/);
  return m ? { built: Number(m[1]), required: Number(m[2]) } : undefined;
}

function archNames(message: string): { have: string; need: string } | undefined {
  // macOS: "(have 'x86_64', need 'arm64')"
  const m = message.match(/have '([\w]+)', need '([\w]+)'/);
  if (!m) return undefined;
  const pick = (a: string) => (ARCHITECTURES.has(a) ? a : 'other');
  return { have: pick(m[1]), need: pick(m[2]) };
}

const FUNCTION_NAME = /^(?:async |new )?[\w$.<>[\]]{1,80}(?: \[as [\w$]{1,40}\])?$/;
const LOCATION = /^[\w@./:-]{1,120}$/;

/** A code location with everything above the code itself removed: the part after
 *  the last node_modules/ (a package's own path), the part after the last out/
 *  (the app's built files) or src/ (a source tree), node: internals as they are,
 *  or else the file's name alone. A location that still has anything but plain
 *  path characters becomes <file>. */
export function codeLocation(raw: string): string {
  let loc = raw.trim().replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');
  const pos = loc.match(/:(\d+):(\d+)$/) ?? loc.match(/:(\d+)$/);
  const lineCol = pos ? pos[0] : '';
  if (pos) loc = loc.slice(0, loc.length - lineCol.length);
  if (!loc.startsWith('node:')) {
    // Below the last node_modules/ is a package's own code. Otherwise the out/ or
    // src/ nearest the end wins, so a parent folder that happens to have one of
    // those names can't pull the folders below it into the report.
    let cut = -1;
    const nm = loc.lastIndexOf('/node_modules/');
    if (nm >= 0) {
      cut = nm + '/node_modules/'.length;
    } else {
      for (const m of ['/out/', '/src/']) {
        const i = loc.lastIndexOf(m);
        if (i >= 0 && i + m.length > cut) cut = i + m.length;
      }
    }
    loc = cut >= 0 ? loc.slice(cut) : loc.slice(loc.lastIndexOf('/') + 1);
  }
  return (LOCATION.test(loc) ? loc : '<file>') + lineCol;
}

/** Stack lines reduced to `function (location)`; the message lines are skipped.
 *  Only the first Node/Electron-internal frame is kept, so the frames that fit
 *  are the app's and its packages' own (a native-module failure is otherwise ten
 *  frames of module loader). */
export function stackFrames(stack: unknown): string[] {
  const frames: string[] = [];
  let internalKept = false;
  for (const line of str(stack).split('\n')) {
    const m = line.match(/^\s+at (.+)$/);
    if (!m) continue;
    const frame = m[1].trim();
    const call = frame.match(/^(.*?) \((.*)\)$/);
    let out: string;
    if (call) {
      const fn = FUNCTION_NAME.test(call[1]) ? call[1] : '<function>';
      out = `${fn} (${codeLocation(call[2])})`;
    } else {
      out = codeLocation(frame);
    }
    const internal = /\(node:|^node:/.test(out);
    if (internal && internalKept) continue;
    if (internal) internalKept = true;
    frames.push(out);
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames;
}

export function errorFacts(err: unknown): ErrorFacts {
  const message = str((err as { message?: unknown } | null)?.message);
  const code = errorCode(err);
  const category = categorize(err, code, message);
  const facts: ErrorFacts = { category, type: errorType(err), frames: stackFrames((err as { stack?: unknown } | null)?.stack) };
  if (code) facts.code = code;
  if (category === 'native-module-version') {
    const abi = abiNumbers(message);
    if (abi) facts.abi = abi;
  }
  if (category === 'native-module-architecture') {
    const arch = archNames(message);
    if (arch) facts.arch = arch;
  }
  if (category === 'migration') {
    const inner = errorFacts((err as { original?: unknown }).original);
    delete inner.original;
    facts.original = inner;
  }
  return facts;
}

// ── the stored trace ─────────────────────────────────────────────────────────

/** Whether this is an installed build. electron-vite's dev mode is never packaged. */
export function buildKind(): 'installed' | 'development' {
  return app.isPackaged ? 'installed' : 'development';
}

let filePathOverride: string | null = null;

/** Tests point the trace at a temporary file. */
export function setTraceFilePath(p: string | null): void {
  filePathOverride = p;
}

function traceFilePath(): string | null {
  if (filePathOverride) return filePathOverride;
  try {
    return path.join(app.getPath('userData'), FILE_NAME);
  } catch {
    return null;
  }
}

/** UTC to the minute, e.g. 2026-11-13T14:05Z. */
export function minuteStamp(d: Date): string {
  return d.toISOString().slice(0, 16) + 'Z';
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Re-validates an entry read from disk, so a hand-edited or older file can't
 *  put anything into a report that this module would not have written. */
function cleanEntry(raw: unknown): TraceEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const event = pick(r.event, TRACE_EVENTS);
  const at = typeof r.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(r.at) ? r.at : null;
  if (!event || !at) return null;
  const entry: TraceEntry = { at, event };
  const stage = pick(r.stage, UNLOCK_STAGES);
  if (stage) entry.stage = stage;
  if (r.detail !== undefined) entry.detail = pick(r.detail, TRACE_DETAILS) ?? 'other';
  if (typeof r.version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.]{1,20})?$/.test(r.version)) entry.version = r.version;
  const build = pick(r.build, ['installed', 'development'] as const);
  if (build) entry.build = build;
  const error = cleanFacts(r.error, true);
  if (error) entry.error = error;
  return entry;
}

function cleanFacts(raw: unknown, allowOriginal: boolean): ErrorFacts | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const facts: ErrorFacts = {
    category: pick(r.category, ERROR_CATEGORIES) ?? 'other',
    type: typeof r.type === 'string' && ERROR_TYPES.has(r.type) ? r.type : 'other',
    frames: Array.isArray(r.frames)
      ? r.frames.filter((f): f is string => typeof f === 'string' && /^[\w$.<>[\]@./: ()-]{1,220}$/.test(f)).slice(0, MAX_FRAMES)
      : [],
  };
  const code = errorCode(r);
  if (code) facts.code = code;
  const abi = r.abi as { built?: unknown; required?: unknown } | undefined;
  if (abi && Number.isInteger(abi.built) && Number.isInteger(abi.required)) {
    facts.abi = { built: abi.built as number, required: abi.required as number };
  }
  const arch = r.arch as { have?: unknown; need?: unknown } | undefined;
  if (arch && typeof arch.have === 'string' && typeof arch.need === 'string') {
    facts.arch = {
      have: ARCHITECTURES.has(arch.have) ? arch.have : 'other',
      need: ARCHITECTURES.has(arch.need) ? arch.need : 'other',
    };
  }
  if (allowOriginal) {
    const original = cleanFacts(r.original, false);
    if (original) facts.original = original;
  }
  return facts;
}

export function readTrace(): TraceEntry[] {
  const file = traceFilePath();
  if (!file) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(cleanEntry).filter((e): e is TraceEntry => e !== null).slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

export interface RecordOptions {
  stage?: UnlockStage;
  detail?: string;
  error?: unknown;
  version?: string;
  build?: 'installed' | 'development';
}

/** Adds one event to the trace. Never throws: diagnostics must not break the app. */
export function recordEvent(event: TraceEvent, opts: RecordOptions = {}, now: Date = new Date()): void {
  try {
    const file = traceFilePath();
    if (!file) return;
    const candidate = cleanEntry({
      at: minuteStamp(now),
      event,
      stage: opts.stage,
      detail: opts.detail,
      version: opts.version,
      build: opts.build,
      error: opts.error === undefined ? undefined : errorFacts(opts.error),
    });
    if (!candidate) return;
    const entries = [...readTrace(), candidate].slice(-MAX_ENTRIES);
    fs.writeFileSync(file, JSON.stringify(entries), { mode: 0o600 });
  } catch {
    // ignore — a full disk or unwritable folder loses the event, nothing else
  }
}

export function clearTrace(): void {
  const file = traceFilePath();
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    /* nothing to clear */
  }
}
