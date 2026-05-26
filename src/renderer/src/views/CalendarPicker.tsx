import { useEffect, useRef, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import './CalendarPicker.css';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToYMD(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function fmtShort(iso: string, showYear: boolean): string {
  const { y, m, d } = isoToYMD(iso);
  const base = `${MONTHS_SHORT[m - 1]} ${d}`;
  if (!showYear) return base;
  return `${base} '${String(y).slice(2)}`;
}

function buildCells(viewYear: number, viewMonth: number) {
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth - 1, 0).getDate();

  const cells: Array<{ y: number; m: number; d: number; overflow: boolean }> = [];

  const prevM = viewMonth === 1 ? 12 : viewMonth - 1;
  const prevY = viewMonth === 1 ? viewYear - 1 : viewYear;
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ y: prevY, m: prevM, d: daysInPrev - i, overflow: true });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y: viewYear, m: viewMonth, d, overflow: false });
  }

  const rem = cells.length % 7;
  if (rem !== 0) {
    const nextM = viewMonth === 12 ? 1 : viewMonth + 1;
    const nextY = viewMonth === 12 ? viewYear + 1 : viewYear;
    for (let d = 1; d <= 7 - rem; d++) {
      cells.push({ y: nextY, m: nextM, d, overflow: true });
    }
  }

  return cells;
}

const YEAR_WINDOW = 12;
function buildYearRange(centre: number): number[] {
  const start = centre - Math.floor(YEAR_WINDOW / 2);
  return Array.from({ length: YEAR_WINDOW }, (_, i) => start + i);
}

export function CalendarPicker({
  label,
  value,
  onChange,
  showYear = false,
  maxDate,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  showYear?: boolean;
  maxDate?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [yearPageOffset, setYearPageOffset] = useState(0);
  const [focusedDayIndex, setFocusedDayIndex] = useState<number | null>(null);
  const [focusedMonthIndex, setFocusedMonthIndex] = useState<number | null>(null);
  const [focusedYearIndex, setFocusedYearIndex] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dayGridRef = useRef<HTMLDivElement>(null);
  const monthGridRef = useRef<HTMLDivElement>(null);
  const yearGridRef = useRef<HTMLDivElement>(null);

  useClickOutside(wrapRef, () => { setOpen(false); setMode('days'); }, { isOpen: open });

  const moveFocusAfterNavRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (mode === 'days') {
      const dayCells = dayGridRef.current?.querySelectorAll<HTMLButtonElement>('.cal-day:not(.cal-day--disabled)');
      if (!dayCells || !dayCells.length) return;
      if (focusedDayIndex === null || moveFocusAfterNavRef.current) {
        moveFocusAfterNavRef.current = false;
        const selectedBtn = dayGridRef.current?.querySelector<HTMLButtonElement>('.cal-day--selected');
        const defaultIdx = selectedBtn ? Array.from(dayCells).indexOf(selectedBtn) : 0;
        const idx = Math.max(0, defaultIdx);
        setFocusedDayIndex(idx);
        dayCells[idx]?.focus();
      }
    } else if (mode === 'months') {
      const monthCells = monthGridRef.current?.querySelectorAll<HTMLButtonElement>('.cal-month-cell:not(:disabled)');
      if (!monthCells || !monthCells.length) return;
      moveFocusAfterNavRef.current = false;
      const idx = focusedMonthIndex ?? (viewMonth - 1);
      setFocusedMonthIndex(idx);
      monthCells[idx]?.focus();
    } else if (mode === 'years') {
      const yearCells = yearGridRef.current?.querySelectorAll<HTMLButtonElement>('.cal-year-cell:not(:disabled)');
      if (!yearCells || !yearCells.length) return;
      moveFocusAfterNavRef.current = false;
      const idx = focusedYearIndex ?? Math.floor(YEAR_WINDOW / 2);
      setFocusedYearIndex(idx);
      yearCells[idx]?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, viewYear, viewMonth, yearPageOffset]);

  function openCalendar() {
    if (value) {
      const { y, m } = isoToYMD(value);
      setViewYear(y);
      setViewMonth(m);
    } else {
      const now = new Date();
      setViewYear(now.getFullYear());
      setViewMonth(now.getMonth() + 1);
    }
    setMode('days');
    setYearPageOffset(0);
    setFocusedDayIndex(null);
    setFocusedMonthIndex(null);
    setFocusedYearIndex(null);
    setOpen((v) => !v);
  }

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function selectDay(y: number, m: number, d: number) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    onChange(iso);
    setOpen(false);
    setMode('days');
    triggerRef.current?.focus();
  }

  function selectYear(y: number) {
    setViewYear(y);
    setFocusedMonthIndex(null);
    setMode('months');
  }

  function selectMonth(m: number) {
    setViewMonth(m);
    setFocusedDayIndex(null);
    setMode('days');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setMode('days');
  }

  function handleDayGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      dayGridRef.current?.querySelectorAll<HTMLButtonElement>('.cal-day:not(.cal-day--disabled)') ?? [],
    );
    if (!buttons.length) return;
    const current = document.activeElement as HTMLButtonElement | null;
    const idx = current ? buttons.indexOf(current) : -1;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = idx + 1 < buttons.length ? idx + 1 : 0;
      buttons[next].focus();
      setFocusedDayIndex(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = idx - 1 >= 0 ? idx - 1 : buttons.length - 1;
      buttons[prev].focus();
      setFocusedDayIndex(prev);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = idx + 7 < buttons.length ? idx + 7 : idx;
      buttons[next].focus();
      setFocusedDayIndex(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = idx - 7 >= 0 ? idx - 7 : idx;
      buttons[prev].focus();
      setFocusedDayIndex(prev);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      moveFocusAfterNavRef.current = true;
      setFocusedDayIndex(null);
      nextMonth();
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      moveFocusAfterNavRef.current = true;
      setFocusedDayIndex(null);
      prevMonth();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setMode('days');
      triggerRef.current?.focus();
    }
  }

  function handleMonthGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      monthGridRef.current?.querySelectorAll<HTMLButtonElement>('.cal-month-cell:not(:disabled)') ?? [],
    );
    if (!buttons.length) return;
    const current = document.activeElement as HTMLButtonElement | null;
    const idx = current ? buttons.indexOf(current) : -1;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = idx + 1 < buttons.length ? idx + 1 : 0;
      buttons[next].focus();
      setFocusedMonthIndex(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = idx - 1 >= 0 ? idx - 1 : buttons.length - 1;
      buttons[prev].focus();
      setFocusedMonthIndex(prev);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = idx + 3 < buttons.length ? idx + 3 : idx;
      buttons[next].focus();
      setFocusedMonthIndex(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = idx - 3 >= 0 ? idx - 3 : idx;
      buttons[prev].focus();
      setFocusedMonthIndex(prev);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMode('days');
      setFocusedDayIndex(null);
    }
  }

  function handleYearGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      yearGridRef.current?.querySelectorAll<HTMLButtonElement>('.cal-year-cell:not(:disabled)') ?? [],
    );
    if (!buttons.length) return;
    const current = document.activeElement as HTMLButtonElement | null;
    const idx = current ? buttons.indexOf(current) : -1;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = idx + 1 < buttons.length ? idx + 1 : 0;
      buttons[next].focus();
      setFocusedYearIndex(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = idx - 1 >= 0 ? idx - 1 : buttons.length - 1;
      buttons[prev].focus();
      setFocusedYearIndex(prev);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = idx + 3 < buttons.length ? idx + 3 : idx;
      buttons[next].focus();
      setFocusedYearIndex(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = idx - 3 >= 0 ? idx - 3 : idx;
      buttons[prev].focus();
      setFocusedYearIndex(prev);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      moveFocusAfterNavRef.current = true;
      setFocusedYearIndex(null);
      setYearPageOffset((o) => o + 1);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      moveFocusAfterNavRef.current = true;
      setFocusedYearIndex(null);
      setYearPageOffset((o) => o - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMode('days');
      setFocusedDayIndex(null);
    }
  }

  const cells = buildCells(viewYear, viewMonth);
  const yearRange = buildYearRange(viewYear + yearPageOffset * YEAR_WINDOW);
  const todayStr = todayISO();
  const thisYear = new Date().getFullYear();
  const showNav = mode === 'days';
  const showYearPageNav = mode === 'years';
  const maxY = maxDate ? parseInt(maxDate.slice(0, 4), 10) : undefined;
  const maxM = maxDate ? parseInt(maxDate.slice(5, 7), 10) : undefined;

  return (
    <div ref={wrapRef} className="cal-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={`project-meta-action-btn${value ? ' project-meta-action-btn--active' : ''}`}
        onClick={openCalendar}
        aria-label={ariaLabel ?? label}
      >
        {value ? fmtShort(value, showYear) : label}
      </button>
      {value && (
        <button type="button" className="cal-clear-x" onClick={clear} aria-label="Clear date">
          ×
        </button>
      )}

      {open && (
        <div className="cal-dropdown">
          <div className="cal-header">
            {showNav ? (
              <button type="button" className="cal-nav" onClick={prevMonth} aria-label="Previous month">‹</button>
            ) : showYearPageNav ? (
              <button type="button" className="cal-nav" onClick={() => setYearPageOffset((o) => o - 1)} aria-label="Earlier years">‹</button>
            ) : (
              <div className="cal-nav-placeholder" />
            )}
            <span className="cal-month-label">
              {mode === 'days' && (
                <span className="cal-month-name">{MONTHS[viewMonth - 1]}</span>
              )}
              {mode === 'years' ? (
                <span className="cal-year-range">{yearRange[0]} – {yearRange[yearRange.length - 1]}</span>
              ) : (
                <button
                  type="button"
                  className={`cal-year-btn${mode !== 'days' ? ' cal-year-btn--active' : ''}`}
                  onClick={() => { setYearPageOffset(0); if (value) setViewYear(isoToYMD(value).y); setMode('years'); }}
                >
                  {viewYear}
                </button>
              )}
            </span>
            {showNav ? (
              <button type="button" className="cal-nav" onClick={nextMonth} aria-label="Next month">›</button>
            ) : showYearPageNav ? (
              <button type="button" className="cal-nav" onClick={() => setYearPageOffset((o) => o + 1)} aria-label="Later years">›</button>
            ) : (
              <div className="cal-nav-placeholder" />
            )}
          </div>

          {mode === 'years' ? (
            <div ref={yearGridRef} className="cal-year-grid" onKeyDown={handleYearGridKeyDown}>
              {yearRange.map((y) => {
                const yearDisabled = maxY !== undefined && y > maxY;
                const enabledButtons = yearRange.filter((yr) => !(maxY !== undefined && yr > maxY));
                const enabledIdx = enabledButtons.indexOf(y);
                const isFocused = !yearDisabled && enabledIdx === focusedYearIndex;
                return (
                  <button
                    type="button"
                    key={y}
                    tabIndex={isFocused ? 0 : -1}
                    className={[
                      'cal-year-cell',
                      y === viewYear ? 'cal-year-cell--selected' : '',
                      y === thisYear && y !== viewYear ? 'cal-year-cell--today' : '',
                      yearDisabled ? 'cal-day--disabled' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => selectYear(y)}
                    disabled={yearDisabled}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          ) : mode === 'months' ? (
            <div ref={monthGridRef} className="cal-month-grid" onKeyDown={handleMonthGridKeyDown}>
              {MONTHS_SHORT.map((name, i) => {
                const monthDisabled = maxY !== undefined && maxM !== undefined &&
                  (viewYear > maxY || (viewYear === maxY && i + 1 > maxM));
                const enabledMonths = MONTHS_SHORT.map((_, mi) => mi).filter((mi) => {
                  if (maxY === undefined || maxM === undefined) return true;
                  return !(viewYear > maxY || (viewYear === maxY && mi + 1 > maxM));
                });
                const enabledIdx = enabledMonths.indexOf(i);
                const isFocused = !monthDisabled && enabledIdx === focusedMonthIndex;
                return (
                <button
                  type="button"
                  key={name}
                  tabIndex={isFocused ? 0 : -1}
                  className={[
                    'cal-month-cell',
                    i + 1 === viewMonth ? 'cal-month-cell--selected' : '',
                    i + 1 === new Date().getMonth() + 1 && viewYear === thisYear ? 'cal-month-cell--today' : '',
                    monthDisabled ? 'cal-day--disabled' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => selectMonth(i + 1)}
                  disabled={monthDisabled}
                >
                  {name}
                </button>
                );
              })}
            </div>
          ) : (
            <div ref={dayGridRef} className="cal-grid" onKeyDown={handleDayGridKeyDown}>
              {DAY_NAMES.map((n) => (
                <div key={n} className="cal-day-name">{n}</div>
              ))}
              {cells.map((cell, i) => {
                const iso = `${cell.y}-${String(cell.m).padStart(2, '0')}-${String(cell.d).padStart(2, '0')}`;
                const isSelected = iso === value;
                const isToday = iso === todayStr && !isSelected;
                const isDisabled = !!maxDate && iso > maxDate;
                const enabledCells = cells.filter((_, ci) => {
                  const ciso = `${cells[ci].y}-${String(cells[ci].m).padStart(2, '0')}-${String(cells[ci].d).padStart(2, '0')}`;
                  return !(!!maxDate && ciso > maxDate);
                });
                const enabledIdx = !isDisabled ? enabledCells.indexOf(cell) : -1;
                const isFocused = !isDisabled && enabledIdx === focusedDayIndex;
                return (
                  <button
                    type="button"
                    key={i}
                    tabIndex={isFocused ? 0 : -1}
                    className={[
                      'cal-day',
                      cell.overflow ? 'cal-day--overflow' : '',
                      isSelected ? 'cal-day--selected' : '',
                      isToday ? 'cal-day--today' : '',
                      isDisabled ? 'cal-day--disabled' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => selectDay(cell.y, cell.m, cell.d)}
                    disabled={isDisabled}
                  >
                    {cell.d}
                  </button>
                );
              })}
            </div>
          )}

          {value && (
            <div className="cal-footer">
              <button type="button" className="cal-clear-all" onClick={clear}>Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
