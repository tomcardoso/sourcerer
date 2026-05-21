import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import argon2 from 'argon2';

export function filenameDateStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

type VaultConfig = { bundlePath: string };

function vaultConfigPath(): string {
  return path.join(app.getPath('userData'), 'vault.json');
}

function readVaultConfig(): VaultConfig | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(vaultConfigPath(), 'utf8'));
    if (typeof parsed?.bundlePath === 'string' && parsed.bundlePath.length > 0) {
      return { bundlePath: parsed.bundlePath };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeVaultConfig(bundlePath: string): void {
  fs.writeFileSync(vaultConfigPath(), JSON.stringify({ bundlePath }), { mode: 0o600 });
}

export function clearVaultConfig(): void {
  try { fs.unlinkSync(vaultConfigPath()); } catch { /* no config to clear */ }
}

export function getVaultBundlePath(): string | null {
  return readVaultConfig()?.bundlePath ?? null;
}

export function getPaths(): { dbPath: string; saltPath: string; screenshotsPath: string } {
  const config = readVaultConfig();
  if (config?.bundlePath) {
    return {
      dbPath: path.join(config.bundlePath, 'db.sqlite'),
      saltPath: path.join(config.bundlePath, 'salt'),
      screenshotsPath: path.join(config.bundlePath, 'screenshots'),
    };
  }
  const userData = app.getPath('userData');
  return {
    dbPath: path.join(userData, 'sourcerer.db'),
    saltPath: path.join(userData, 'sourcerer.salt'),
    screenshotsPath: path.join(userData, 'screenshots'),
  };
}

export function detectSyncProvider(vaultPath: string): string | null {
  const p = vaultPath.replace(/\\/g, '/');

  if (p.includes('/Library/Mobile Documents/')) return 'iCloud Drive';

  // On macOS Ventura+, all cloud providers mount under ~/Library/CloudStorage/.
  // Parse the first path segment to identify the specific provider.
  const cloudStorageMatch = p.match(/\/Library\/CloudStorage\/([^/]+)/);
  if (cloudStorageMatch) {
    const folder = cloudStorageMatch[1].toLowerCase();
    if (folder.startsWith('onedrive')) return 'OneDrive';
    if (folder.startsWith('googledrive')) return 'Google Drive';
    if (folder.startsWith('dropbox')) return 'Dropbox';
    if (folder.startsWith('box')) return 'Box';
    return 'iCloud Drive';
  }

  if (/[/\\]OneDrive([/\\ -]|$)/i.test(vaultPath)) return 'OneDrive';
  if (/[/\\]Google Drive[/\\]/i.test(vaultPath)) return 'Google Drive';
  if (/[/\\]Box Sync[/\\]/i.test(vaultPath) || /[/\\]Box Drive[/\\]/i.test(vaultPath)) return 'Box';

  // Dropbox: check info.json for custom install path, then common path
  try {
    const info = JSON.parse(
      fs.readFileSync(path.join(app.getPath('home'), '.dropbox', 'info.json'), 'utf8'),
    ) as Record<string, { path?: string }>;
    for (const account of Object.values(info)) {
      if (account?.path && p.startsWith(account.path.replace(/\\/g, '/') + '/')) return 'Dropbox';
    }
  } catch { /* Dropbox not installed or info.json unreadable */ }

  if (/[/\\]Dropbox[/\\]/i.test(vaultPath)) return 'Dropbox';

  return null;
}

export async function deriveKey(password: string, salt: Buffer): Promise<string> {
  // Argon2id parameters: 64 MiB memory (well above OWASP's 19 MiB minimum),
  // 3 time iterations, parallelism 1. These were chosen to keep unlock latency
  // under ~1 s on a 2020-era laptop while remaining costly to brute-force.
  const rawKey = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
    salt,
    raw: true,
  });
  return (rawKey as Buffer).toString('hex');
}
