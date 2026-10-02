import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { listStaff } from '../../../staff/api/staff.api';
import { getBranchComparison } from '../../api/reports.api';
import {
  ANALYTICS_TIME_FILTERS,
  type AnalyticsTimeFilter,
  type BranchComparisonMetric,
  type BranchComparisonRow,
} from '../../reports.types';
import {
  METRIC_OPTIONS,
  buildMetricView,
  leaderIndex,
} from './branchComparisonMetrics';
import styles from './BranchComparisonPage.module.css';

/** Fixed hue per branch position (branches arrive ordered by name), never
 * cycled - a 5th+ branch falls back to a muted series and relies on its
 * direct label. Tokens validated in tokens.css (--color-series-1..4). */
const SERIES_CLASSES = [
  styles.series1,
  styles.series2,
  styles.series3,
  styles.series4,
];

function seriesClass(index: number) {
  return SERIES_CLASSES[index] ?? styles.seriesOther;
}

/**
 * Custom change (Branch Comparison page): every non-archived branch side by
 * side - Revenue by default, plus a "Compare by" dropdown for bookings
 * availed, average sale value, and new customers. Superadmin-only - gated
 * here (Navigate away), in the sidebar config (tile `roles`), and server-side
 * (GET /reports/branch-comparison + branchComparison.service.ts).
 *
 * Rendered as one table with a column per branch, so each category row
 * reads straight across Makati -> Southwoods -> any later branch.
 */
export function BranchComparisonPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [metric, setMetric] = useState<BranchComparisonMetric>('revenue');
  const [timeFilter, setTimeFilter] = useState<AnalyticsTimeFilter>('today');

  // Tagged with the period it was fetched for, so "loading" is derived
  // (result is for a different period) rather than set inside the effect.
  const [result, setResult] = useState<{
    timeFilter: AnalyticsTimeFilter;
    branches: BranchComparisonRow[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isSuperadmin = viewerRole === 'Superadmin';

  useEffect(() => {
    if (!accessToken || !isSuperadmin) return;

    let isMounted = true;

    void getBranchComparison(timeFilter, accessToken).then((response) => {
      if (!isMounted) return;

      setResult({
        timeFilter,
        branches: response.data ?? [],
        error: response.error,
      });
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isSuperadmin, timeFilter]);

  const isLoading = result?.timeFilter !== timeFilter;
  const error = isLoading ? null : (result?.error ?? null);
  const branches = useMemo(() => result?.branches ?? [], [result]);

  const view = useMemo(
    () => buildMetricView(metric, branches),
    [metric, branches]
  );

  if (isRoleLoading) {
    return <LoadingState />;
  }

  if (!isSuperadmin || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  const metricLabel =
    METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? '';
  const periodLabel =
    ANALYTICS_TIME_FILTERS.find((filter) => filter.value === timeFilter)
      ?.label ?? '';

  const headlineTotal = view.headlines.reduce((sum, value) => sum + value, 0);
  const headlineLeader = leaderIndex(view.headlines);
  const hasActivity = view.headlines.some((value) => value > 0);

  const chartData = view.isCategorySplit
    ? view.breakdown.map((row) => ({
        label: row.label,
        ...Object.fromEntries(
          branches.map((branch, index) => [branch.branch_id, row.values[index]])
        ),
      }))
    : [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Supervisor · All branches</p>
          <h1 className={styles.title}>Branch Comparison</h1>
        </div>

        <div className={styles.controls}>
          <label className={styles.field}>
            Compare by
            <select
              value={metric}
              onChange={(event) =>
                setMetric(event.target.value as BranchComparisonMetric)
              }
            >
              {METRIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            Time period
            <select
              value={timeFilter}
              onChange={(event) =>
                setTimeFilter(event.target.value as AnalyticsTimeFilter)
              }
            >
              {ANALYTICS_TIME_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {isLoading ? (
        <LoadingState label="Loading branch comparison..." />
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : branches.length === 0 ? (
        <p className={styles.copy}>No active branches to compare.</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>
                {metricLabel} by branch, {periodLabel.toLowerCase()}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.rowHeadCell}>
                    <span className={styles.visuallyHidden}>Category</span>
                  </th>
                  {branches.map((branch, index) => (
                    <th
                      key={branch.branch_id}
                      scope="col"
                      className={styles.branchCell}
                    >
                      <span className={styles.branchName}>
                        <span
                          className={`${styles.swatch} ${seriesClass(index)}`}
                          aria-hidden="true"
                        />
                        {branch.branch_name}
                      </span>
                      <span className={styles.headline}>
                        {view.format(view.headlines[index])}
                      </span>
                      <span className={styles.headlineCaption}>
                        {view.caption}
                        {headlineLeader === index ? (
                          <span className={styles.lead}> · ▲ Leads</span>
                        ) : null}
                      </span>
                      {view.showShare ? (
                        <span className={styles.share}>
                          <span className={styles.shareTrack}>
                            <span
                              className={`${styles.shareFill} ${seriesClass(index)}`}
                              style={{
                                width: `${headlineTotal > 0 ? (view.headlines[index] / headlineTotal) * 100 : 0}%`,
                              }}
                            />
                          </span>
                          <span className={styles.shareLabel}>
                            {headlineTotal > 0
                              ? Math.round(
                                  (view.headlines[index] / headlineTotal) * 100
                                )
                              : 0}
                            % of all branches
                          </span>
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>

              {view.breakdown.length > 0 ? (
                <tbody>
                  {view.breakdown.map((row) => {
                    const rowLeader = leaderIndex(row.values);
                    const format = row.format ?? view.format;

                    return (
                      <tr key={row.label}>
                        <th scope="row" className={styles.rowHeadCell}>
                          {row.label}
                        </th>
                        {row.values.map((value, index) => (
                          <td
                            key={branches[index].branch_id}
                            className={
                              rowLeader === index
                                ? `${styles.valueCell} ${styles.valueLead}`
                                : styles.valueCell
                            }
                          >
                            {rowLeader === index ? (
                              <span className={styles.leadMark}>
                                ▲
                                <span className={styles.visuallyHidden}>
                                  {' '}
                                  highest:{' '}
                                </span>
                              </span>
                            ) : null}
                            {format(value)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              ) : null}
            </table>
          </div>

          {!hasActivity ? (
            <p className={styles.copy}>No activity recorded for this period.</p>
          ) : view.isCategorySplit ? (
            <section className={styles.chartPanel}>
              <div className={styles.chartHeader}>
                <h2 className={styles.chartTitle}>{metricLabel} by service</h2>
                <ul className={styles.legend}>
                  {branches.map((branch, index) => (
                    <li key={branch.branch_id} className={styles.legendItem}>
                      <span
                        className={`${styles.swatch} ${seriesClass(index)}`}
                        aria-hidden="true"
                      />
                      {branch.branch_name}
                    </li>
                  ))}
                </ul>
              </div>

              <ResponsiveContainer
                width="100%"
                height={Math.max(
                  220,
                  chartData.length * (branches.length * 14 + 24)
                )}
              >
                <BarChart
                  data={chartData}
                  layout="vertical"
                  barGap={2}
                  barCategoryGap={12}
                  margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                >
                  <CartesianGrid horizontal={false} className={styles.grid} />
                  <XAxis
                    type="number"
                    tickFormatter={(value: number) => view.format(value)}
                    tick={{ className: styles.axisTick }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={96}
                    tick={{ className: styles.axisTick }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ className: styles.cursor }}
                    content={(props) => (
                      <ChartTooltip
                        {...props}
                        branches={branches}
                        format={view.format}
                      />
                    )}
                  />
                  {branches.map((branch, index) => (
                    <Bar
                      key={branch.branch_id}
                      dataKey={branch.branch_id}
                      name={branch.branch_name}
                      radius={[0, 4, 4, 0]}
                      barSize={12}
                      isAnimationActive={false}
                    >
                      {chartData.map((row) => (
                        <Cell key={row.label} className={seriesClass(index)} />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

/** Just the slice of Recharts' tooltip content props this reads - typing
 * against TooltipContentProps<number, string> fights its ValueType generic. */
interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  branches: BranchComparisonRow[];
  format: (value: number) => string;
}

function ChartTooltip({
  active,
  label,
  branches,
  payload,
  format,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{label}</p>
      <ul className={styles.tooltipList}>
        {branches.map((branch, index) => {
          const entry = payload.find(
            (item) => item.dataKey === branch.branch_id
          );

          return (
            <li key={branch.branch_id} className={styles.tooltipRow}>
              <span
                className={`${styles.swatch} ${seriesClass(index)}`}
                aria-hidden="true"
              />
              <span>{branch.branch_name}</span>
              <span className={styles.tooltipValue}>
                {format(Number(entry?.value ?? 0))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
