import type { GoalRow } from '../../reports.types';
import styles from './GoalTable.module.css';

interface GoalTableProps {
  title: string;
  rows: GoalRow[];
  firstColHeader: string;
  /** Column headings for the two months, e.g. "This month"/"Last month" on
   * the homepage, "Oct 2026"/"Sep 2026" on the Goals page. */
  currentHeader?: string;
  previousHeader?: string;
  /** Gets the row too, for a table that mixes money and counts. */
  format?: (value: number, row: GoalRow) => string;
  /** Adds the "how the goal was set" tag, a progress bar, and (with onEdit)
   * an Edit button per row - the Goals page's fuller view. The homepage
   * widget leaves these off to stay compact. */
  detailed?: boolean;
  onEdit?: (row: GoalRow) => void;
  emptyMessage?: string;
}

/** Share of the goal reached, capped for the bar but not for the label - 130%
 * of goal should read as 130%, in a full bar. */
function progressOf(row: GoalRow): number | null {
  return row.goal > 0 ? (row.actual / row.goal) * 100 : null;
}

/**
 * One titled goal table: a row per metric with the selected month's actual,
 * the month before, and the goal. Shared by the Superadmin homepage's
 * GoalStatsBoard and the Goals page.
 */
export function GoalTable({
  title,
  rows,
  firstColHeader,
  currentHeader = 'This month',
  previousHeader = 'Last month',
  format = (value) => value.toLocaleString(),
  detailed = false,
  onEdit,
  emptyMessage = 'Nothing to show yet.',
}: GoalTableProps) {
  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>{title}</h3>
      {rows.length === 0 ? (
        <p className={styles.copy}>{emptyMessage}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{firstColHeader}</th>
                <th scope="col">{currentHeader}</th>
                <th scope="col">{previousHeader}</th>
                <th scope="col">Goal</th>
                {detailed ? <th scope="col">Progress</th> : null}
                {detailed && onEdit ? (
                  <th scope="col">
                    <span className={styles.visuallyHidden}>Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const met = row.goal > 0 && row.actual >= row.goal;
                const progress = progressOf(row);

                return (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td
                      className={styles.value}
                      data-met={met ? 'true' : undefined}
                    >
                      {format(row.actual, row)}
                    </td>
                    <td className={styles.value}>
                      {format(row.previous, row)}
                    </td>
                    <td className={styles.goal}>
                      {format(row.goal, row)}
                      {detailed ? (
                        <span className={styles.source}>
                          {row.goal_source === 'target'
                            ? 'exact'
                            : `+${row.growth_rate}%`}
                        </span>
                      ) : null}
                    </td>
                    {detailed ? (
                      <td className={styles.progressCell}>
                        {progress === null ? (
                          <span className={styles.noGoal}>No goal</span>
                        ) : (
                          <span
                            className={styles.progress}
                            data-met={met ? 'true' : undefined}
                          >
                            <span className={styles.track} aria-hidden="true">
                              <span
                                className={styles.fill}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </span>
                            <span className={styles.percent}>
                              {Math.round(progress)}%
                            </span>
                          </span>
                        )}
                      </td>
                    ) : null}
                    {detailed && onEdit ? (
                      <td className={styles.actionCell}>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => onEdit(row)}
                          aria-label={`Edit goal for ${row.label}`}
                        >
                          Edit
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
