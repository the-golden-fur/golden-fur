import { useMemo, useState } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import type {
  AutoBuildAssignment,
  AutoBuildPreviewResult,
  BranchScheduleEntry,
  StaffProfile,
} from '../../staff.types';
import {
  LEAVE_TYPE_ABBR,
  WEEKDAY_HEADERS,
  daysInMonth,
  dateKey,
} from './monthlyScheduleUtils';
import styles from './MonthlySchedulePage.module.css';

interface AutoBuildPreviewModalProps {
  year: number;
  /** 1-12 - the caller adds 1 to the page's own 0-indexed `month` state
   * before passing this down, matching the server's convention. */
  month: number;
  roster: StaffProfile[];
  preview: AutoBuildPreviewResult;
  /** Precomputed by the page (entriesByStaffAndDate) - reused here rather
   * than recomputed, since it already covers this same month/branch. */
  entriesByStaffAndDate: Map<string, Map<string, BranchScheduleEntry[]>>;
  isCommitting: boolean;
  onClose: () => void;
  onConfirm: (
    assignments: AutoBuildAssignment[]
  ) => Promise<{ error: string | null }>;
}

/**
 * Auto Build Monthly Schedule's preview/adjust step - a staff x day grid,
 * pre-checked from the server's proposal, that the admin can freely tick or
 * untick before the final Confirm actually saves anything. A day that
 * already has an existing schedule entry (any leave type/status) renders as
 * a locked badge instead of a checkbox - it's already occupied, so it was
 * never a candidate the server could have proposed here anyway. Closing
 * this modal (x, backdrop, or Cancel) just unmounts it - nothing was ever
 * written, so there's nothing to roll back.
 */
export function AutoBuildPreviewModal({
  year,
  month,
  roster,
  preview,
  entriesByStaffAndDate,
  isCommitting,
  onClose,
  onConfirm,
}: AutoBuildPreviewModalProps) {
  const [selected, setSelected] = useState<Map<string, Set<string>>>(
    () =>
      new Map(
        preview.assignments.map((assignment) => [
          assignment.staff_id,
          new Set(assignment.dates),
        ])
      )
  );
  const [error, setError] = useState<string | null>(null);

  const totalDays = daysInMonth(year, month - 1);
  const days = Array.from({ length: totalDays }, (_, index) => index + 1);

  const rosterById = useMemo(
    () => new Map(roster.map((staff) => [staff.id, staff])),
    [roster]
  );

  function toggle(staffId: string, date: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(staffId) ?? []);
      if (set.has(date)) {
        set.delete(date);
      } else {
        set.add(date);
      }
      next.set(staffId, set);
      return next;
    });
  }

  async function handleConfirm() {
    setError(null);
    const assignments: AutoBuildAssignment[] = [...selected.entries()].map(
      ([staff_id, dates]) => ({ staff_id, dates: [...dates].sort() })
    );

    const result = await onConfirm(assignments);
    if (result.error) {
      setError(result.error);
    }
  }

  return (
    <Modal
      isOpen
      title="Review Auto Build proposal"
      onClose={onClose}
      size="wide"
    >
      <p className={styles.copy}>
        Untick anything you don&apos;t want, or tick an extra day - nothing is
        saved until you confirm below.
      </p>

      <div className={styles.gridScroll}>
        <table className={styles.gridTable}>
          <thead>
            <tr>
              <th className={styles.gridCornerCell} scope="col">
                Staff
              </th>
              {days.map((day) => (
                <th key={day} className={styles.gridDateHeaderCell} scope="col">
                  <span className={styles.gridDow}>
                    {WEEKDAY_HEADERS[new Date(year, month - 1, day).getDay()]}
                  </span>
                  <span className={styles.gridDay}>{day}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.assignments.map(({ staff_id: staffId }) => {
              const staff = rosterById.get(staffId);
              const staffSelected = selected.get(staffId) ?? new Set();

              return (
                <tr key={staffId}>
                  <th className={styles.gridStaffCell} scope="row">
                    <span>{staff?.display_name ?? 'Staff'}</span>
                    <span className={styles.gridStaffRole}>
                      {staffSelected.size}/{preview.targetPerStaff}
                    </span>
                  </th>
                  {days.map((day) => {
                    const date = dateKey(year, month - 1, day);
                    const existing = entriesByStaffAndDate
                      .get(staffId)
                      ?.get(date)?.[0];

                    return (
                      <td key={day} className={styles.gridCell}>
                        {existing ? (
                          <span
                            className={styles.gridBadge}
                            title={`${existing.leave_type} (already scheduled)`}
                          >
                            {LEAVE_TYPE_ABBR[existing.leave_type]}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`${
                              staff?.display_name ?? 'Staff'
                            } rest day on ${date}`}
                            checked={staffSelected.has(date)}
                            onChange={() => toggle(staffId, date)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={isCommitting}
          onClick={() => void handleConfirm()}
        >
          {isCommitting ? 'Saving...' : 'Confirm'}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onClose}
          disabled={isCommitting}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
