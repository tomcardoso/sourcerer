export function validateEmail(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed);
}

export function isGoogleAlertUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'news.google.com' && u.pathname.startsWith('/rss')) return true;
    if ((u.hostname === 'www.google.com' || u.hostname === 'google.com') &&
        u.pathname.startsWith('/alerts/feeds/')) return true;
    return false;
  } catch {
    return false;
  }
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
