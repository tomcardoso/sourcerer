export function validateEmail(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed);
}

export function validateUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
