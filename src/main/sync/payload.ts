interface SetupPayload {
  v: number;
  name: string;
  description: string | null;
  path: string;
  key: string; // base64-encoded 32-byte key
}

export function encodePayload(
  name: string,
  description: string | null,
  filePath: string,
  keyBytes: Buffer,
): string {
  const payload: SetupPayload = { v: 1, name, description, path: filePath, key: keyBytes.toString('base64') };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodePayload(encoded: string): {
  name: string;
  description: string | null;
  originalPath: string;
  keyHex: string;
} {
  let json: string;
  try {
    json = Buffer.from(encoded.trim(), 'base64url').toString('utf8');
  } catch {
    throw new Error('Invalid setup payload — could not decode.');
  }

  let payload: SetupPayload;
  try {
    payload = JSON.parse(json) as SetupPayload;
  } catch {
    throw new Error('Invalid setup payload — not valid JSON.');
  }

  if (payload.v !== 1) throw new Error(`Unknown payload version ${payload.v}.`);

  const keyBytes = Buffer.from(payload.key, 'base64');
  if (keyBytes.length !== 32) throw new Error('Invalid key length in payload.');

  return {
    name: payload.name ?? 'Shared Project',
    description: payload.description ?? null,
    originalPath: payload.path,
    keyHex: keyBytes.toString('hex'),
  };
}
