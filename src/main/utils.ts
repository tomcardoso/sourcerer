import { app } from 'electron';
import path from 'path';
import argon2 from 'argon2';

export function filenameDateStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function getPaths(): { dbPath: string; saltPath: string } {
  const userData = app.getPath('userData');
  return {
    dbPath: path.join(userData, 'sourcerer.db'),
    saltPath: path.join(userData, 'sourcerer.salt'),
  };
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
