import { useCallback, useEffect, useState } from 'react';
import { getCageGrid, setCageMaintenanceStatus } from '../../api/hotel.api';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import type { Cage, CageSize, CageStatus } from '../../hotel.types';
import styles from './CageStatusGrid.module.css';

const SIZE_ORDER: CageSize[] = ['S', 'M', 'L', 'XL'];

const STATUS_CLASSNAME: Record<CageStatus, keyof typeof styles> = {
  Available: 'statusAvailable',
  Occupied: 'statusOccupied',
  Reserved: 'statusReserved',
  'Under Maintenance': 'statusMaintenance',
};

interface CageStatusGridProps {
  accessToken: string;
  viewerRole: string;
  /** Bump to force a refetch (e.g. right after check-in/checkout) without a
   * page reload - #79 AC-3. */
  refreshSignal?: number;
  onSelectCage?: (cage: Cage) => void;
  selectedCageId?: string | null;
  /** Cage ids matching the server-suggested size/availability (#75) - shown
   * with a "Recommended" badge so the grid alone can replace a separate
   * suggested-cage list, instead of showing the same cages twice. */
  suggestedCageIds?: string[];
}

/**
 * Issue #79: cage grid grouped by size category (S/M/L/XL) with a status-
 * colour badge per cage; Admin sees an Under Maintenance toggle on each
 * card, non-Admin roles do not (AC-5).
 */
export function CageStatusGrid({
  accessToken,
  viewerRole,
  refreshSignal,
  onSelectCage,
  selectedCageId,
  suggestedCageIds,
}: CageStatusGridProps) {
  const [grid, setGrid] = useState<Record<CageSize, Cage[]> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = viewerRole === 'Admin' || viewerRole === 'Superadmin';

  const load = useCallback(() => {
    void getCageGrid(accessToken).then((result) => {
      setIsLoading(false);
      if (result.data) {
        setGrid(result.data);
      } else {
        setError(result.error);
      }
    });
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  async function toggleMaintenance(cage: Cage) {
    const nextStatus =
      cage.status === 'Under Maintenance' ? 'Available' : 'Under Maintenance';

    const result = await setCageMaintenanceStatus(
      cage.id,
      nextStatus,
      accessToken
    );

    if (result.data) {
      load();
    }
  }

  if (isLoading) {
    return <p className={styles.copy}>Loading cage status...</p>;
  }

  if (error || !grid) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error ?? 'Unable to load cage status.'}
      </p>
    );
  }

  return (
    <div className={styles.grid}>
      {SIZE_ORDER.map((size) => (
        <div key={size} className={styles.sizeGroup}>
          <h3 className={styles.sizeTitle}>Size {size}</h3>
          <div className={styles.cageList}>
            {grid[size].length === 0 ? (
              <p className={styles.copy}>No cages of this size.</p>
            ) : (
              grid[size].map((cage) => (
                <div
                  key={cage.id}
                  className={
                    cage.id === selectedCageId
                      ? styles.cageCardActive
                      : styles.cageCard
                  }
                  onClick={
                    onSelectCage && cage.status === 'Available'
                      ? () => onSelectCage(cage)
                      : undefined
                  }
                  role={onSelectCage ? 'button' : undefined}
                >
                  <div className={styles.cageHeader}>
                    <span className={styles.cageLabel}>{cage.cage_label}</span>
                    {suggestedCageIds?.includes(cage.id) ? (
                      <span className={styles.recommendedBadge}>
                        Recommended
                      </span>
                    ) : null}
                    {isAdmin &&
                    (cage.status === 'Available' ||
                      cage.status === 'Under Maintenance') ? (
                      <MoreOptionsMenu
                        label={`More options for ${cage.cage_label}`}
                        items={[
                          {
                            label:
                              cage.status === 'Under Maintenance'
                                ? 'Mark Available'
                                : 'Mark Under Maintenance',
                            onSelect: () => void toggleMaintenance(cage),
                          },
                        ]}
                      />
                    ) : null}
                  </div>
                  <span className={styles[STATUS_CLASSNAME[cage.status]]}>
                    {cage.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
