import { useCallback, useEffect, useState } from 'react';
import {
  closeCageTemporarily,
  getCageGrid,
  reopenCage,
  setCageMaintenanceStatus,
} from '../../api/hotel.api';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { CageCloseDialog } from './CageCloseDialog';
import {
  OVERRIDE_ROLES,
  formatClosedUntil,
  isClosedToCustomers,
} from './cageClosure';
import type { Cage, CageSize, CageStatus } from '../../hotel.types';
import styles from './CageStatusGrid.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { CageSizeWarningBadge } from '../../../../shared/components/CageSizeWarningBadge/CageSizeWarningBadge';
import {
  describeCageSizeMismatch,
  getCageSizeFit,
  isCageSizeMismatch,
} from '../../../../shared/utils/cageSizeFit';

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
  /** The pet's own size (pets.weight_class) when this grid is used to pick
   * a cage at check-in - a selected cage of any other size gets a warning
   * badge plus a line under the grid saying why. Omitted on pages that only
   * browse cages, which show no size warning at all. */
  petSize?: string | null;
}

/**
 * Issue #79: cage grid grouped by size category (S/M/L/XL) with a status-
 * colour badge per cage; Admin sees an Under Maintenance toggle on each
 * card, non-Admin roles do not (AC-5).
 *
 * Custom change (front-desk cage override): front desk roles also get a
 * "..." menu on Available cages to close one to customers for a chosen time
 * (or reopen it early). A closed cage stays selectable here - the closure
 * only blocks customers.
 */
export function CageStatusGrid({
  accessToken,
  viewerRole,
  refreshSignal,
  onSelectCage,
  selectedCageId,
  suggestedCageIds,
  petSize,
}: CageStatusGridProps) {
  const [grid, setGrid] = useState<Record<CageSize, Cage[]> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = viewerRole === 'Admin' || viewerRole === 'Superadmin';
  const canOverride = OVERRIDE_ROLES.includes(viewerRole);
  const [closingCage, setClosingCage] = useState<Cage | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // When the grid was last fetched - closures are judged against this rather
  // than Date.now() during render, which must stay pure.
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(() => {
    void getCageGrid(accessToken).then((result) => {
      setIsLoading(false);
      if (result.data) {
        setGrid(result.data);
        setLoadedAt(Date.now());
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

  async function closeCage(minutes: number): Promise<string | null> {
    if (!closingCage) return null;

    const result = await closeCageTemporarily(
      closingCage.id,
      minutes,
      accessToken
    );

    if (!result.data) return result.error ?? 'Could not close the cage.';

    load();
    return null;
  }

  async function reopen(cage: Cage) {
    const result = await reopenCage(cage.id, accessToken);

    if (result.data) {
      setActionError(null);
      load();
    } else {
      setActionError(result.error ?? `Could not reopen ${cage.cage_label}.`);
    }
  }

  function menuItemsFor(cage: Cage): MoreOptionsMenuItem[] {
    const items: MoreOptionsMenuItem[] = [];

    if (canOverride && cage.status === 'Available') {
      if (isClosedToCustomers(cage, loadedAt)) {
        items.push(
          { label: 'Change close time', onSelect: () => setClosingCage(cage) },
          { label: 'Reopen now', onSelect: () => void reopen(cage) }
        );
      } else {
        items.push({
          label: 'Close to customers',
          onSelect: () => setClosingCage(cage),
        });
      }
    }

    if (
      isAdmin &&
      (cage.status === 'Available' || cage.status === 'Under Maintenance')
    ) {
      items.push({
        label:
          cage.status === 'Under Maintenance'
            ? 'Mark Available'
            : 'Mark Under Maintenance',
        onSelect: () => void toggleMaintenance(cage),
      });
    }

    return items;
  }

  if (isLoading) {
    return <LoadingState label="Loading cage status..." />;
  }

  if (error || !grid) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error ?? 'Unable to load cage status.'}
      </p>
    );
  }

  const selectedCage = SIZE_ORDER.flatMap((size) => grid[size]).find(
    (cage) => cage.id === selectedCageId
  );
  const selectedFit = getCageSizeFit(petSize, selectedCage?.size);
  const sizeWarning =
    selectedCage && petSize && isCageSizeMismatch(selectedFit)
      ? { cageId: selectedCage.id, fit: selectedFit }
      : null;

  return (
    <div className={styles.grid}>
      {selectedCage && petSize && sizeWarning ? (
        <p className={styles.sizeWarning} role="status">
          {describeCageSizeMismatch(
            sizeWarning.fit,
            petSize,
            selectedCage.cage_label,
            selectedCage.size
          )}
        </p>
      ) : null}
      {actionError ? (
        <p className={styles.errorBanner} role="alert">
          {actionError}
        </p>
      ) : null}
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
                    {sizeWarning?.cageId === cage.id ? (
                      <CageSizeWarningBadge fit={sizeWarning.fit} />
                    ) : null}
                    {menuItemsFor(cage).length > 0 ? (
                      <MoreOptionsMenu
                        label={`More options for ${cage.cage_label}`}
                        items={menuItemsFor(cage)}
                      />
                    ) : null}
                  </div>
                  <div className={styles.cageStatusRow}>
                    <span className={styles[STATUS_CLASSNAME[cage.status]]}>
                      {cage.status}
                    </span>
                    {cage.closed_until &&
                    isClosedToCustomers(cage, loadedAt) ? (
                      <span
                        className={styles.closedBadge}
                        title="Closed to customers - staff can still use it"
                      >
                        Closed until{' '}
                        {formatClosedUntil(cage.closed_until, loadedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
      <CageCloseDialog
        key={closingCage?.id ?? 'closed'}
        cage={closingCage}
        onClose={() => setClosingCage(null)}
        onConfirm={closeCage}
      />
    </div>
  );
}
