import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { getAnalyticsSummary } from '../../api/reports.api';
import {
  ANALYTICS_TIME_FILTERS,
  type AnalyticsTimeFilter,
} from '../../reports.types';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import styles from './BranchRevenueComparisonChart.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

interface BranchRevenueComparisonChartProps {
  branches: BranchSummary[];
  timeFilter: AnalyticsTimeFilter;
  accessToken: string;
  /** Gives the chart its own "Time period" control, starting on
   * `timeFilter` - for a host with no period control of its own (the
   * Superadmin home dashboard). Left off, the chart simply follows
   * `timeFilter` (the Analytics page, which has its own dropdown). */
  filterable?: boolean;
}

interface BranchRevenueSlice {
  branchId: string;
  branchName: string;
  revenue: number;
  className: string;
}

const PESO_FORMATTER = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

/**
 * Always compares both Makati and Southwoods regardless of the page's
 * branch dropdown above (single-branch-at-a-time) - that dropdown can't
 * show the one thing this chart is for. Matched by name against the
 * already-loaded branches list rather than hardcoded ids, since branch ids
 * are seed/environment-specific.
 */
export function BranchRevenueComparisonChart({
  branches,
  timeFilter,
  accessToken,
  filterable = false,
}: BranchRevenueComparisonChartProps) {
  const [ownTimeFilter, setOwnTimeFilter] =
    useState<AnalyticsTimeFilter>(timeFilter);
  const activeTimeFilter = filterable ? ownTimeFilter : timeFilter;
  const [slices, setSlices] = useState<BranchRevenueSlice[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const makati = branches.find((branch) => branch.name === 'Makati');
  const southwoods = branches.find((branch) => branch.name === 'Southwoods');

  useEffect(() => {
    if (!accessToken || !makati || !southwoods) return;

    let isMounted = true;

    void Promise.all([
      getAnalyticsSummary(activeTimeFilter, makati.id, accessToken),
      getAnalyticsSummary(activeTimeFilter, southwoods.id, accessToken),
    ]).then(([makatiResult, southwoodsResult]) => {
      if (!isMounted) return;

      setIsLoading(false);

      const firstError = makatiResult.error ?? southwoodsResult.error;
      if (firstError) {
        setError(firstError);
        return;
      }

      // A period that failed must not leave its error up once another loads.
      setError(null);
      setSlices([
        {
          branchId: makati.id,
          branchName: makati.name,
          revenue: makatiResult.data?.total_revenue ?? 0,
          className: styles.makatiSlice,
        },
        {
          branchId: southwoods.id,
          branchName: southwoods.name,
          revenue: southwoodsResult.data?.total_revenue ?? 0,
          className: styles.southwoodsSlice,
        },
      ]);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, activeTimeFilter, makati, southwoods]);

  if (!makati || !southwoods) {
    return null;
  }

  const totalRevenue =
    slices?.reduce((sum, slice) => sum + slice.revenue, 0) ?? 0;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Makati vs Southwoods Revenue</h2>

        {filterable ? (
          <label className={styles.field}>
            Time period
            <select
              className={styles.control}
              value={ownTimeFilter}
              onChange={(event) =>
                setOwnTimeFilter(event.target.value as AnalyticsTimeFilter)
              }
            >
              {ANALYTICS_TIME_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState label="Loading comparison..." />
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : !slices || totalRevenue === 0 ? (
        <p className={styles.copy}>No revenue recorded for this period.</p>
      ) : (
        <div className={styles.body}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="revenue"
                nameKey="branchName"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                strokeWidth={2}
                className={styles.pieStroke}
                isAnimationActive={false}
              >
                {slices.map((slice) => (
                  <Cell key={slice.branchId} className={slice.className} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  PESO_FORMATTER.format(Number(value)),
                  name,
                ]}
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <ul className={styles.legend}>
            {slices.map((slice) => (
              <li key={slice.branchId} className={styles.legendRow}>
                <span className={`${styles.swatch} ${slice.className}`} />
                <span className={styles.legendLabel}>{slice.branchName}</span>
                <span className={styles.legendValue}>
                  {PESO_FORMATTER.format(slice.revenue)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
