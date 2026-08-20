import { Link } from 'react-router';
import type { DashboardTileConfig } from '../../../config/staffDashboard.config';
import styles from './DashboardTile.module.css';

interface DashboardTileProps extends DashboardTileConfig {
  /** Custom change (Settings > Config subtiles): when provided, the tile
   * renders as a button that calls this instead of navigating via `to` -
   * used inside the Settings modal, where selecting a Config tile embeds
   * the target page inline rather than leaving the modal. `to` still comes
   * along on the same tile config so the caller knows what to navigate to
   * if the modal is later expanded to fullscreen. Takes priority over `to`
   * when both are present. */
  onSelect?: () => void;
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
  onSelect,
}: DashboardTileProps) {
  if (onSelect) {
    return (
      <button
        type="button"
        className={`${styles.tile} ${styles.tileLink} ${styles.tileButton}`}
        onClick={onSelect}
      >
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>
      </button>
    );
  }

  if (!to) {
    return (
      <div className={styles.tile} aria-disabled="true">
        <div className={styles.tileHeader}>
          <h3 className={styles.title}>{title}</h3>
          <span className={styles.comingSoon}>Coming soon</span>
        </div>
        <p className={styles.description}>{description}</p>
      </div>
    );
  }

  return (
    <Link to={to} className={`${styles.tile} ${styles.tileLink}`}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
    </Link>
  );
}
