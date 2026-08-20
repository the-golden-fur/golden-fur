import { DashboardTile } from '../../../features/staff/components/dashboard/DashboardTile/DashboardTile';
import {
  CONFIG_TILES,
  SYSTEM_CONFIG_TILE,
  type ConfigTileConfig,
} from '../configTiles.config';
import styles from '../SettingsPage.module.css';

interface ConfigTabProps {
  isSuperadmin: boolean;
  /** Custom change (Settings > Config subtiles): selecting a tile embeds its
   * page inline inside the Settings modal instead of navigating away - see
   * SettingsPage.tsx, which owns the actual embedded rendering and passes
   * this handler down. */
  onSelectTile: (tile: ConfigTileConfig) => void;
}

/**
 * Settings > Config (Admin/Superadmin only). One entry point for every
 * admin-config page - the pages themselves (maintenance.routes.tsx,
 * discounts.routes.tsx) are untouched; only their entry surface moved here
 * from the admin dashboard, which now holds only day-to-day operational
 * tiles (see staffDashboard.config.ts). System Configuration is
 * Superadmin-only, matching that page's own ALLOWED_VIEWER_ROLES gate.
 */
export function ConfigTab({ isSuperadmin, onSelectTile }: ConfigTabProps) {
  const tiles = isSuperadmin
    ? [...CONFIG_TILES, SYSTEM_CONFIG_TILE]
    : CONFIG_TILES;

  return (
    <div className={styles.grid}>
      {tiles.map((tile) => (
        <DashboardTile
          key={tile.title}
          title={tile.title}
          description={tile.description}
          onSelect={() => onSelectTile(tile)}
        />
      ))}
    </div>
  );
}
