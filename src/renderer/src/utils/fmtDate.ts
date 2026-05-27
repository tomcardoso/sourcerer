/**
 * Format a Unix timestamp (seconds) as a short, locale-aware date string.
 * Returns 'Never' when ts is null.
 *
 * Same-year dates omit the year: "Jan 5"
 * Cross-year dates include it:  "Jan 5, 2024"
 */
export function fmtDate(ts: number | null): string {
  if (ts === null) return 'Never';
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Format a Unix timestamp (seconds) with relative labels for very recent dates.
 * Falls back to `fetched` when `ts` is null.
 *
 * "Today" / "Yesterday" / "3d ago" / "Jan 5" / "Jan 5, 2024"
 */
export function fmtDateRelative(ts: number | null, fetched: number): string {
  const d = new Date((ts ?? fetched) * 1000);
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const tomorrowStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const ms = d.getTime();
  if (ms >= todayStart && ms < tomorrowStart) return 'Today';
  if (ms >= yesterdayStart && ms < todayStart) return 'Yesterday';
  const diffDays = Math.round((todayStart - startOfDay(d)) / 86400000);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (d.getFullYear() === new Date().getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Convert a Unix timestamp (seconds) to a YYYY-MM-DD day key in local time. */
export function toDayKey(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Format a YYYY-MM-DD day key as a human-readable label ("Today", "Yesterday", "Monday, Jan 5, 2025"). */
export function fmtDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date();
  const todayKey = toDayKey(Math.floor(today.getTime() / 1000));
  if (key === todayKey) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yKey = toDayKey(Math.floor(yesterday.getTime() / 1000));
  if (key === yKey) return 'Yesterday';
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${d}, ${y}`;
}

/** Format a Unix timestamp (seconds) as a 12-hour time string ("9:05 am"). */
export function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${min} ${h >= 12 ? 'pm' : 'am'}`;
}

/** Convert a YYYY-MM-DD date string to a Unix timestamp (seconds) at 09:00 local time. */
export function dateStrToUnix(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T09:00:00`).getTime() / 1000);
}

/**
 * Format a Unix timestamp (seconds) as a full date always including the year.
 * Returns '—' when ts is null.
 *
 * "Jan 5, 2025"
 */
export function fmtDateFull(ts: number | null): string {
  if (ts === null) return '—';
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
