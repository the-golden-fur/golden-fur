import { useEffect, useState } from 'react';
import { getCageOccupancyReport } from '../../api/reports.api';
import type { CageOccupancyRow } from '../../reports.types';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import styles from './CageAvailabilityWidget.module.css';

interface CageAvailabilityWidgetProps {
  branches: BranchSummary[];
  accessToken: string;
}

interface BranchCageAvailability {
  branchId: string;
  branchName: string;
  availableCount: number;
}

function countAvailable(rows: CageOccupancyRow[]): number {
  return rows
    .filter((row) => row.status === 'Available')
    .reduce((sum, row) => sum + row.cage_count, 0);
}

/**
 * Superadmin dashboard widget - available-cage counts for both branches at
 * once. GET /reports/cage-occupancy only reports one branch (or every
 * branch combined) per call, with no per-branch breakdown, so this calls it
 * once per branch, same convention as BranchRevenueComparisonChart.
 */
export function CageAvailabilityWidget({
  branches,
  accessToken,
}: CageAvailabilityWidgetProps) {
  const [availability, setAvailability] = useState<
    BranchCageAvailability[] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const makati = branches.find((branch) => branch.name === 'Makati');
  const southwoods = branches.find((branch) => branch.name === 'Southwoods');

  useEffect(() => {
    if (!accessToken || !makati || !southwoods) return;

    let isMounted = true;

    void Promise.all([
      getCageOccupancyReport(makati.id, accessToken),
      getCageOccupancyReport(southwoods.id, accessToken),
    ]).then(([makatiResult, southwoodsResult]) => {
      if (!isMounted) return;

      setIsLoading(false);

      const firstError = makatiResult.error ?? southwoodsResult.error;
      if (firstError) {
        setError(firstError);
        return;
      }

      setAvailability([
        {
          branchId: makati.id,
          branchName: makati.name,
          availableCount: countAvailable(makatiResult.data ?? []),
        },
        {
          branchId: southwoods.id,
          branchName: southwoods.name,
          availableCount: countAvailable(southwoodsResult.data ?? []),
        },
      ]);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, makati, southwoods]);

  if (!makati || !southwoods) {
    return null;
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>Cage Availability</h2>

      {isLoading ? (
        <p className={styles.copy}>Loading cage availability...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : (
        <ul className={styles.list}>
          {availability?.map((branch) => (
            <li key={branch.branchId} className={styles.row}>
              <span className={styles.branchName}>{branch.branchName}</span>
              <span className={styles.count}>
                {branch.availableCount} available
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
