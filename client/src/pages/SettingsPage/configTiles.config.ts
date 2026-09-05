import type { ComponentType } from 'react';
import {
  BadgePercent,
  Calculator,
  DoorOpen,
  Dog,
  Package,
  Percent,
  Receipt,
  ScrollText,
  Settings2,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import { AdminServicesAndPackagesPage } from '../../features/maintenance/pages/AdminServicesAndPackagesPage/AdminServicesAndPackagesPage';
import { PricingConfigurationPage } from '../../features/maintenance/pages/PricingConfigurationPage/PricingConfigurationPage';
import { AdminPromoConfigPage } from '../../features/maintenance/pages/AdminPromoConfigPage/AdminPromoConfigPage';
import { AdminBreedsPage } from '../../features/maintenance/pages/AdminBreedsPage/AdminBreedsPage';
import { SystemConfigurationPage } from '../../features/maintenance/pages/SystemConfigurationPage/SystemConfigurationPage';
import { ProductCatalogPage } from '../../features/catalog/pages/ProductCatalogPage/ProductCatalogPage';
import { AdminDiscountManagementPage } from '../../features/discounts/pages/AdminDiscountManagementPage/AdminDiscountManagementPage';
import { MiscSaleManagementPage } from '../../features/billing/pages/MiscSaleManagementPage/MiscSaleManagementPage';
import { PolicyConfigurationPage } from '../../features/booking/pages/PolicyConfigurationPage/PolicyConfigurationPage';
import { AdminCagesPage } from '../../features/hotel/pages/AdminCagesPage/AdminCagesPage';

export interface ConfigTileConfig {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  /** The real page this tile's `to` route renders - rendered inline inside
   * Settings' content pane when the tile is selected (custom change:
   * "selecting a tile in admin settings > config will open it inline"),
   * and what the "Open as a full page" button navigates to once one of
   * these is active. */
  Component: ComponentType;
}

/**
 * Same one entry point per admin-config page as before (moved off the admin
 * dashboard onto Settings > Config), now carrying the actual page component
 * alongside its route so SettingsPage can embed it directly instead of only
 * linking to it. Shared by ConfigTab (the tile grid) and SettingsPage (the
 * sidebar's Config sub-items) so there is exactly one list to keep in sync.
 */
export const CONFIG_TILES: ConfigTileConfig[] = [
  {
    title: 'Services and Packages',
    description: 'Manage services, service types, and packages.',
    to: '/staff/admin/maintenance/services-and-packages',
    icon: Package,
    Component: AdminServicesAndPackagesPage,
  },
  {
    title: 'Pricing Configuration',
    description: 'Set the shared grooming size/coat pricing calculation.',
    to: '/staff/admin/maintenance/pricing-configuration',
    icon: Calculator,
    Component: PricingConfigurationPage,
  },
  {
    title: 'Promos',
    description: 'Configure time-limited promotions.',
    to: '/staff/admin/maintenance/promos',
    icon: BadgePercent,
    Component: AdminPromoConfigPage,
  },
  {
    title: 'Breed Management',
    description: 'Add, rename, or remove breeds available on pet profiles.',
    to: '/staff/admin/maintenance/breeds',
    icon: Dog,
    Component: AdminBreedsPage,
  },
  {
    title: 'Product Catalog',
    description:
      'Manage hotel-suppliable food/medication and other sellable products, by category.',
    to: '/staff/admin/product-catalog',
    icon: ShoppingBag,
    Component: ProductCatalogPage,
  },
  {
    title: 'Discounts',
    description: 'Manage standing discounts, incl. Senior Citizen/PWD.',
    to: '/staff/admin/discounts',
    icon: Percent,
    Component: AdminDiscountManagementPage,
  },
  {
    title: 'Miscellaneous Sales',
    description: 'Review, edit, or remove recorded miscellaneous sales.',
    to: '/staff/admin/misc-sales',
    icon: Receipt,
    Component: MiscSaleManagementPage,
  },
  {
    title: 'Policies',
    description:
      'Reschedule & new-booking notice periods, reschedule fee, Staff Picker, lunch break, payments & downpayment, cancellation credit, credit expiry.',
    to: '/staff/admin/maintenance/policies',
    icon: ScrollText,
    Component: PolicyConfigurationPage,
  },
  {
    title: 'Cages',
    description: 'Add, edit, delete, or mark a cage Under Maintenance.',
    to: '/staff/admin/hotel/cages',
    icon: DoorOpen,
    Component: AdminCagesPage,
  },
];

export const SYSTEM_CONFIG_TILE: ConfigTileConfig = {
  title: 'System Configuration',
  description: 'Branch name, address, and operating hours.',
  to: '/staff/admin/maintenance/system-configuration',
  icon: Settings2,
  Component: SystemConfigurationPage,
};
