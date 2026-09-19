import type { ReactNode } from 'react';
import styles from './DataCalendar.module.css';

export type DataCalendarMode = 'month' | 'week';

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function dateKeyFromDate(date: Date): string {
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function addDays(date: Date, delta: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + delta);
  return result;
}

export interface DataCalendarProps<T> {
  mode: DataCalendarMode;
  /** Any date that falls in the month (month mode) or week (week mode) to
   * display - only its year/month/day are read. */
  anchorDate: Date;
  onAnchorDateChange: (date: Date) => void;
  items: T[];
  /** Must return a single 'YYYY-MM-DD' key - an item with more than one
   * relevant date isn't a fit for this component. */
  getItemDate: (item: T) => string;
  getRowKey: (item: T) => string;
  renderChip: (item: T) => ReactNode;
  onDayActivate?: (dateKey: string) => void;
  /** Overrides the default `Add entry on ${dateKey}` aria-label for the
   * per-day add button. */
  dayActivateLabel?: (dateKey: string) => string;
  /** Set to false when the caller already renders its own prev/next nav
   * elsewhere on the page (e.g. because a sibling non-calendar view shares
   * the same anchorDate control) - the grid itself never depends on it. */
  showNav?: boolean;
}

/**
 * Generic month/week calendar grid - the "Calendar" option in a page's view
 * switcher. Generalizes MonthlySchedulePage's month-grid math (date-key
 * bucketing, leading blanks, month nav); week mode is net-new, with no
 * prior page to copy from.
 */
export function DataCalendar<T>({
  mode,
  anchorDate,
  onAnchorDateChange,
  items,
  getItemDate,
  getRowKey,
  renderChip,
  onDayActivate,
  dayActivateLabel,
  showNav = true,
}: DataCalendarProps<T>) {
  const itemsByDate = new Map<string, T[]>();
  for (const item of items) {
    const key = getItemDate(item);
    const bucket = itemsByDate.get(key) ?? [];
    bucket.push(item);
    itemsByDate.set(key, bucket);
  }

  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  let cells: Array<Date | null>;
  let label: string;

  if (mode === 'month') {
    const leadingBlanks = new Date(year, month, 1).getDay();
    const totalDays = daysInMonth(year, month);
    cells = [
      ...Array.from({ length: leadingBlanks }, () => null),
      ...Array.from(
        { length: totalDays },
        (_, index) => new Date(year, month, index + 1)
      ),
    ];
    label = `${MONTH_LABELS[month]} ${year}`;
  } else {
    const start = startOfWeek(anchorDate);
    const end = addDays(start, 6);
    cells = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    label =
      start.getMonth() === end.getMonth()
        ? `${MONTH_LABELS[start.getMonth()]} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`
        : `${MONTH_LABELS[start.getMonth()]} ${start.getDate()} - ${MONTH_LABELS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }

  function goToPrev() {
    onAnchorDateChange(
      mode === 'month' ? addMonths(anchorDate, -1) : addDays(anchorDate, -7)
    );
  }

  function goToNext() {
    onAnchorDateChange(
      mode === 'month' ? addMonths(anchorDate, 1) : addDays(anchorDate, 7)
    );
  }

  return (
    <div className={styles.wrapper}>
      {showNav ? (
        <div className={styles.nav}>
          <button
            type="button"
            className={styles.navButton}
            onClick={goToPrev}
            aria-label={mode === 'month' ? 'Previous month' : 'Previous week'}
          >
            &larr;
          </button>
          <span className={styles.navLabel}>{label}</span>
          <button
            type="button"
            className={styles.navButton}
            onClick={goToNext}
            aria-label={mode === 'month' ? 'Next month' : 'Next week'}
          >
            &rarr;
          </button>
        </div>
      ) : null}

      <div
        className={
          mode === 'month' ? styles.calendarMonth : styles.calendarWeek
        }
      >
        {WEEKDAY_HEADERS.map((headerLabel) => (
          <div key={headerLabel} className={styles.weekdayHeader}>
            {headerLabel}
          </div>
        ))}
        {cells.map((date, index) => {
          if (date === null) {
            return (
              <div key={`blank-${index}`} className={styles.dayCellBlank} />
            );
          }

          const key = dateKeyFromDate(date);
          const dayItems = itemsByDate.get(key) ?? [];

          return (
            <div key={key} className={styles.dayCell}>
              <div className={styles.dayCellHeader}>
                <span>{date.getDate()}</span>
                {onDayActivate ? (
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={() => onDayActivate(key)}
                    aria-label={
                      dayActivateLabel
                        ? dayActivateLabel(key)
                        : `Add entry on ${key}`
                    }
                  >
                    +
                  </button>
                ) : null}
              </div>
              <div className={styles.dayChips}>
                {dayItems.map((item) => (
                  <div key={getRowKey(item)}>{renderChip(item)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
