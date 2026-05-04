import { app } from 'electron';
import path from 'path';
import argon2 from 'argon2';

export function getPaths(): { dbPath: string; saltPath: string } {
  const userData = app.getPath('userData');
  return {
    dbPath: path.join(userData, 'sourceror.db'),
    saltPath: path.join(userData, 'sourceror.salt'),
  };
}

export async function deriveKey(password: string, salt: Buffer): Promise<string> {
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
