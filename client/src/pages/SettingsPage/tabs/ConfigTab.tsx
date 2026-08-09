import { DashboardTile } from '../../../features/staff/components/dashboard/DashboardTile/DashboardTile';
import type { DashboardTileConfig } from '../../../features/staff/config/staffDashboard.config';
import styles from '../SettingsPage.module.css';

const CONFIG_TILES: DashboardTileConfig[] = [
  {
    title: 'Services and Packages',
    description: 'Manage services, service types, and packages.',
    to: '/staff/admin/maintenance/services-and-packages',
  },
  {
    title: 'Pricing Configuration',
    description: 'Set the shared grooming size/coat pricing calculation.',
    to: '/staff/admin/maintenance/pricing-configuration',
  },
  {
    title: 'Promos',
    description: 'Configure time-limited promotions.',
    to: '/staff/admin/maintenance/promos',
  },
  {
    title: 'Breed Management',
    description: 'Add, rename, or remove breeds available on pet profiles.',
    to: '/staff/admin/maintenance/breeds',
  },
  {
    title: 'Product Catalog',
    description:
      'Manage hotel-suppliable food/medication and other sellable products, by category.',
    to: '/staff/admin/product-catalog',
  },
  {
    title: 'Discounts',
    description: 'Manage standing discounts, incl. Senior Citizen/PWD.',
    to: '/staff/admin/discounts',
  },
  {
    title: 'Miscellaneous Sales',
    description: 'Review, edit, or remove recorded miscellaneous sales.',
    to: '/staff/admin/misc-sales',
  },
  {
    title: 'Policies',
    description:
      'Reschedule notice period, Staff Picker visibility, and the fixed lunch break.',
    to: '/staff/admin/maintenance/policies',
  },
];

const SYSTEM_CONFIG_TILE: DashboardTileConfig = {
  title: 'System Configuration',
  description: 'Branch name, address, and operating hours.',
  to: '/staff/admin/maintenance/system-configuration',
};

interface ConfigTabProps {
  isSuperadmin: boolean;
}

/**
 * Settings > Config (Admin/Superadmin only). One entry point for every
 * admin-config page - the pages themselves (maintenance.routes.tsx,
 * discounts.routes.tsx) are untouched; only their entry surface moved here
 * from the admin dashboard, which now holds only day-to-day operational
 * tiles (see staffDashboard.config.ts). System Configuration is
 * Superadmin-only, matching that page's own ALLOWED_VIEWER_ROLES gate.
 */
export function ConfigTab({ isSuperadmin }: ConfigTabProps) {
  const tiles = isSuperadmin
    ? [...CONFIG_TILES, SYSTEM_CONFIG_TILE]
    : CONFIG_TILES;

  return (
    <div className={styles.grid}>
      {tiles.map((tile) => (
        <DashboardTile key={tile.title} {...tile} />
      ))}
    </div>
  );
}
