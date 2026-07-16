import { Link } from 'react-router';
import type { DashboardTileConfig } from '../../staffDashboard.config';
import styles from './DashboardTile.module.css';

/**
 * A tile is either a link to an already-built page, or - when `to` is
 * omitted - a "Coming soon" placeholder for a role's module that hasn't
 * been implemented yet (see staffDashboard.config.ts).
 */
export function DashboardTile({ title, description, to }: DashboardTileConfig) {
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
