import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { DashboardTileConfig } from '../../../config/staffDashboard.config';
import styles from './DashboardTile.module.css';

interface DashboardTileProps extends DashboardTileConfig {
  /** Custom change (Settings > Config subtiles): when provided, the tile
   * renders as a button that calls this instead of navigating via `to` -
   * used inside Settings, where selecting a Config tile embeds the target
   * page inline rather than navigating away. `to` still comes along on the
   * same tile config so the caller knows what to navigate to if that
   * embedded page is later popped out to its own full page. Takes priority
   * over `to` when both are present. */
  onSelect?: () => void;
  /** Custom change (Settings > Config tile icons): not part of the shared
   * DashboardTileConfig, since the operational dashboard's own tiles
   * (staffDashboard.config.ts) don't carry one yet - optional so those
   * callers keep working unchanged. */
  icon?: LucideIcon;
}

/**
 * A tile is either a link to an already-built page, an inline-select button
 * (`onSelect`), or - when both are omitted - a "Coming soon" placeholder for
 * a role's module that hasn't been implemented yet (see
 * staffDashboard.config.ts).
 */
export function DashboardTile({
  title,
  description,
  to,
  icon: Icon,
  onSelect,
}: DashboardTileProps) {
  const titleRow = (
    <div className={styles.titleRow}>
      {Icon ? (
        <Icon size={20} aria-hidden="true" className={styles.tileIcon} />
      ) : null}
      <h3 className={styles.title}>{title}</h3>
    </div>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className={`${styles.tile} ${styles.tileLink} ${styles.tileButton}`}
        onClick={onSelect}
      >
        {titleRow}
        <p className={styles.description}>{description}</p>
      </button>
    );
  }

  if (!to) {
    return (
      <div className={styles.tile} aria-disabled="true">
        <div className={styles.tileHeader}>
          {titleRow}
          <span className={styles.comingSoon}>Coming soon</span>
        </div>
        <p className={styles.description}>{description}</p>
      </div>
    );
  }

  return (
    <Link to={to} className={`${styles.tile} ${styles.tileLink}`}>
      {titleRow}
      <p className={styles.description}>{description}</p>
    </Link>
  );
}
