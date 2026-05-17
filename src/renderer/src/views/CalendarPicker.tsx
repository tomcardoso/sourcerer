import { useRef, useState } from 'react';
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  showYear?: boolean;
  maxDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useClickOutside(wrapRef, () => { setOpen(false); setMode('days'); }, { isOpen: open });

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
  }

  function selectYear(y: number) {
    setViewYear(y);
    setMode('months');
  }

  function selectMonth(m: number) {
    setViewMonth(m);
    setMode('days');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setMode('days');
  }

  const cells = buildCells(viewYear, viewMonth);
  const yearRange = buildYearRange(viewYear);
  const todayStr = todayISO();
  const thisYear = new Date().getFullYear();
  const showNav = mode === 'days';

  return (
    <div ref={wrapRef} className="cal-wrap">
      <button
        type="button"
        className={`project-meta-action-btn${value ? ' project-meta-action-btn--active' : ''}`}
        onClick={openCalendar}
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
            ) : (
              <div className="cal-nav-placeholder" />
            )}
            <span className="cal-month-label">
              {mode === 'days' && (
                <span className="cal-month-name">{MONTHS[viewMonth - 1]}</span>
              )}
              <button
                type="button"
                className={`cal-year-btn${mode !== 'days' ? ' cal-year-btn--active' : ''}`}
                onClick={() => setMode(mode === 'years' ? 'days' : 'years')}
              >
                {viewYear}
              </button>
            </span>
            {showNav ? (
              <button type="button" className="cal-nav" onClick={nextMonth} aria-label="Next month">›</button>
            ) : (
              <div className="cal-nav-placeholder" />
            )}
          </div>

          {mode === 'years' ? (
            <div className="cal-year-grid">
              {yearRange.map((y) => (
                <button
                  type="button"
                  key={y}
                  className={[
                    'cal-year-cell',
                    y === viewYear ? 'cal-year-cell--selected' : '',
                    y === thisYear && y !== viewYear ? 'cal-year-cell--today' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => selectYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          ) : mode === 'months' ? (
            <div className="cal-month-grid">
              {MONTHS_SHORT.map((name, i) => (
                <button
                  type="button"
                  key={name}
                  className={[
                    'cal-month-cell',
                    i + 1 === viewMonth ? 'cal-month-cell--selected' : '',
                    i + 1 === new Date().getMonth() + 1 && viewYear === thisYear ? 'cal-month-cell--today' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => selectMonth(i + 1)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <div className="cal-grid">
              {DAY_NAMES.map((n) => (
                <div key={n} className="cal-day-name">{n}</div>
              ))}
              {cells.map((cell, i) => {
                const iso = `${cell.y}-${String(cell.m).padStart(2, '0')}-${String(cell.d).padStart(2, '0')}`;
                const isSelected = iso === value;
                const isToday = iso === todayStr && !isSelected;
                const isDisabled = !!maxDate && iso > maxDate;
                return (
                  <button
                    type="button"
                    key={i}
                    className={[
                      'cal-day',
                      cell.overflow ? 'cal-day--overflow' : '',
                      isSelected ? 'cal-day--selected' : '',
                      isToday ? 'cal-day--today' : '',
                      isDisabled ? 'cal-day--disabled' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => !isDisabled && selectDay(cell.y, cell.m, cell.d)}
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
