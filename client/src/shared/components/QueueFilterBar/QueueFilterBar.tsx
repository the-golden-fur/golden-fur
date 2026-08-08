import type { ReactNode } from 'react';
import { CalendarDays, ListFilter } from 'lucide-react';
import {
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangePreset,
} from './dateRangePreset';
import styles from './QueueFilterBar.module.css';

export interface QueueStatusOption {
  value: string;
  label: string;
}

export interface QueueFilterBarProps {
  dateRangePreset: DateRangePreset;
  onDateRangePresetChange: (preset: DateRangePreset) => void;
  /** YYYY-MM-DD. Only read/shown when dateRangePreset === 'custom'. */
  customDate: string;
  onCustomDateChange: (date: string) => void;
  statusValue: string;
  onStatusChange: (value: string) => void;
  statusOptions: QueueStatusOption[];
  statusLabel?: string;
  /** Page-specific extra filters (e.g. service type, branch) rendered
   * alongside the date/status fields, styled the same way. */
  children?: ReactNode;
}

/**
 * Shared filter toolbar for the Receptionist Bookings Queue, Grooming Queue,
 * and Veterinary Console - a date-range preset select (with a custom-date
 * picker that only appears for the 'custom' preset) plus a status select, so
 * all three queues offer the same filtering vocabulary and look.
 */
export function QueueFilterBar({
  dateRangePreset,
  onDateRangePresetChange,
  customDate,
  onCustomDateChange,
  statusValue,
  onStatusChange,
  statusOptions,
  statusLabel = 'Status',
  children,
}: QueueFilterBarProps) {
  return (
    <div className={styles.toolbar}>
      <label className={styles.filterField}>
        <span className={styles.filterLabel}>
          <CalendarDays size={12} aria-hidden="true" />
          Date
        </span>
        <select
          className={styles.filterSelect}
          value={dateRangePreset}
          onChange={(event) =>
            onDateRangePresetChange(event.target.value as DateRangePreset)
          }
        >
          {DATE_RANGE_PRESET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {dateRangePreset === 'custom' ? (
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Custom date</span>
          <input
            className={styles.filterSelect}
            type="date"
            value={customDate}
            onChange={(event) => onCustomDateChange(event.target.value)}
          />
        </label>
      ) : null}

      <label className={styles.filterField}>
        <span className={styles.filterLabel}>
          <ListFilter size={12} aria-hidden="true" />
          {statusLabel}
        </span>
        <select
          className={styles.filterSelect}
          value={statusValue}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {children}
    </div>
  );
}
