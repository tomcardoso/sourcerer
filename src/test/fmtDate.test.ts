import { describe, it, expect } from 'vitest';
import { localDayBounds, logDateToUnix, logEditDateToUnix, toDayKey } from '../renderer/src/utils/fmtDate';

// ---------------------------------------------------------------------------
// localDayBounds (#439)
// ---------------------------------------------------------------------------

describe('localDayBounds', () => {
  it('returns start/end timestamps that fall on the requested local calendar day', () => {
    const { start, end } = localDayBounds('2026-07-01');

    const startDate = new Date(start * 1000);
    const endDate = new Date(end * 1000);
    expect(startDate.getFullYear()).toBe(2026);
    expect(startDate.getMonth()).toBe(6); // 0-indexed: July
    expect(startDate.getDate()).toBe(1);
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);

    expect(endDate.getDate()).toBe(1);
    expect(end - start).toBe(86399);
  });

  it('does not shift to UTC midnight the way `new Date(dateStr)` would', () => {
    // `new Date('2026-07-01')` parses as UTC midnight; converting straight to a
    // Unix timestamp would land on June 30 local time in any timezone west of UTC.
    // localDayBounds must always resolve to local midnight of the requested day.
    const { start } = localDayBounds('2026-07-01');
    const localMidnight = new Date(2026, 6, 1).getTime() / 1000;
    expect(start).toBe(localMidnight);
  });
});

// ---------------------------------------------------------------------------
// logDateToUnix / logEditDateToUnix: the stamp saved for an interaction-log entry
// ---------------------------------------------------------------------------

describe('logDateToUnix', () => {
  const ts = (y: number, m: number, d: number, h = 0, min = 0) =>
    Math.floor(new Date(y, m - 1, d, h, min, 0).getTime() / 1000);

  it("stamps today with the current time, so it is never in the future (the morning case: noon hasn't come yet)", () => {
    const now = new Date(2026, 10, 15, 0, 15, 30);
    const result = logDateToUnix('2026-11-15', now);
    expect(result).toBe(Math.floor(now.getTime() / 1000));
    expect(result).toBeLessThanOrEqual(Math.floor(now.getTime() / 1000) + 3600);
  });

  it('stamps today with the current time in the afternoon too, so same-day entries keep their order', () => {
    const first = logDateToUnix('2026-11-15', new Date(2026, 10, 15, 14, 0, 0));
    const second = logDateToUnix('2026-11-15', new Date(2026, 10, 15, 14, 5, 0));
    expect(second).toBeGreaterThan(first);
  });

  it('stamps any other day at noon local time, which stays on that calendar day', () => {
    const now = new Date(2026, 10, 15, 0, 15, 0);
    const result = logDateToUnix('2026-11-10', now);
    expect(result).toBe(ts(2026, 11, 10, 12));
    expect(toDayKey(result)).toBe('2026-11-10');
  });

  it('keeps a day boundary: just after midnight is still today, the evening before is yesterday', () => {
    const now = new Date(2026, 10, 15, 0, 0, 1);
    expect(logDateToUnix('2026-11-15', now)).toBe(Math.floor(now.getTime() / 1000));
    expect(logDateToUnix('2026-11-14', now)).toBe(ts(2026, 11, 14, 12));
  });
});

describe('logEditDateToUnix', () => {
  const now = new Date(2026, 10, 15, 9, 30, 0);
  const original = Math.floor(new Date(2026, 10, 10, 16, 42, 7).getTime() / 1000);

  it("keeps the entry's own timestamp when its day is unchanged", () => {
    expect(logEditDateToUnix('2026-11-10', original, now)).toBe(original);
  });

  it('stamps a changed day as a new entry would: noon, or the current time for today', () => {
    expect(logEditDateToUnix('2026-11-09', original, now)).toBe(
      Math.floor(new Date(2026, 10, 9, 12, 0, 0).getTime() / 1000),
    );
    expect(logEditDateToUnix('2026-11-15', original, now)).toBe(Math.floor(now.getTime() / 1000));
  });
});
