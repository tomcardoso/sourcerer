import { describe, it, expect } from 'vitest';
import { localDayBounds } from '../renderer/src/utils/fmtDate';

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
