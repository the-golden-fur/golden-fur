import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getCageOccupancyReport } from '../../../../reports/api/reports.api';
import type { CageOccupancyRow } from '../../../../reports/reports.types';
import styles from './CageOccupancyWidget.module.css';

interface CageOccupancyWidgetProps {
  branchId: string;
  accessToken: string;
}

const SIZE_ORDER: CageOccupancyRow['size'][] = ['S', 'M', 'L', 'XL'];

const SIZE_LABEL: Record<CageOccupancyRow['size'], string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra Large',
};

const STATUS_TOKEN: Record<CageOccupancyRow['status'], string> = {
  Available: styles.statusAvailable,
  Occupied: styles.statusOccupied,
  Reserved: styles.statusReserved,
  'Under Maintenance': styles.statusMaintenance,
};

/**
 * Receptionist dashboard widget - the same per-size-category badge summary
 * as CageOccupancyReport's own top section, scoped to just the viewer's
 * branch (no branch selector - unlike that page's Superadmin variant, a
 * receptionist only ever sees their own branch's cages).
 */
export function CageOccupancyWidget({
  branchId,
  accessToken,
}: CageOccupancyWidgetProps) {
  const [rows, setRows] = useState<CageOccupancyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !branchId) return;

    let isMounted = true;

    void getCageOccupancyReport(branchId, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error) {
        setError(result.error);
        return;
      }

      setRows(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId]);

  const bySize = SIZE_ORDER.map((size) => ({
    size,
    rows: (rows ?? []).filter((row) => row.size === size),
  }));

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Cage Occupancy</h2>
        <Link to="/staff/reports/cage-occupancy" className={styles.viewLink}>
          View details
        </Link>
      </div>

      {rows === null && !error ? (
        <p className={styles.copy}>Loading cage occupancy...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : (
        <div className={styles.grid}>
          {bySize.map(({ size, rows: sizeRows }) => (
            <div key={size} className={styles.sizeGroup}>
              <h3 className={styles.sizeTitle}>{SIZE_LABEL[size]}</h3>
              <div className={styles.badges}>
                {sizeRows.length === 0 ? (
                  <span className={styles.copy}>No cages</span>
                ) : (
                  sizeRows.map((row) => (
                    <span
                      key={row.status}
                      className={`${styles.badge} ${STATUS_TOKEN[row.status]}`}
                    >
                      {row.status}: {row.cage_count}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
