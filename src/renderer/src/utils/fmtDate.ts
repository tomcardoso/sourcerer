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

/**
 * Format a Unix timestamp (seconds) with relative labels for very recent dates.
 * Falls back to `fetched` when `ts` is null.
 *
 * "Today" / "Yesterday" / "3d ago" / "Jan 5" / "Jan 5, 2024"
 */
export function fmtDateRelative(ts: number | null, fetched: number): string {
  const d = new Date((ts ?? fetched) * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
