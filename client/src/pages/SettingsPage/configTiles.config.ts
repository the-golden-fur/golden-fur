import type { ComponentType } from 'react';
import {
  Building2,
  Calculator,
  DoorOpen,
  Gift,
  Package,
  PawPrint,
  Percent,
  Receipt,
  Scale,
  ScrollText,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import { AdminServicesAndPackagesPage } from '../../features/maintenance/pages/AdminServicesAndPackagesPage/AdminServicesAndPackagesPage';
import { PricingConfigurationPage } from '../../features/maintenance/pages/PricingConfigurationPage/PricingConfigurationPage';
import { WeightClassConfigurationPage } from '../../features/maintenance/pages/WeightClassConfigurationPage/WeightClassConfigurationPage';
import { AdminPromosAndRewardsPage } from '../../features/maintenance/pages/AdminPromosAndRewardsPage/AdminPromosAndRewardsPage';
import { AdminPetsPage } from '../../features/maintenance/pages/AdminPetsPage/AdminPetsPage';
import { BranchesPage } from '../../features/maintenance/pages/BranchesPage/BranchesPage';
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
   * these is active.
   *
   * Every `Component` here is a standalone routed page whose own root CSS
   * class sets `min-height: var(--config-embed-min-height, 100vh)` rather
   * than a bare `100vh` - SettingsPage.module.css's `.content` sets that
   * variable to `100%` so the page fills the (shorter) embedded pane
   * instead of forcing a full extra viewport of empty space below its
   * content when scrolled. A new page added here (or any page it in turn
   * wraps/embeds, e.g. a mini-navbar-subtabs page) must use the same
   * `var(--config-embed-min-height, 100vh)` pattern from the start, or the
   * empty-space bug reproduces for it.
   *
   * Typed `ComponentType<any>` rather than a bare prop-less `ComponentType`
   * (session 87, Branches->Policies pre-scoping) since SettingsPage.tsx can
   * now pass extra props through to whichever tile it renders
   * (`pendingConfigProps`, set via `selectConfigTile`'s second argument) -
   * every tile that doesn't expect any simply ignores them. */
  Component: ComponentType<any>;
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
    title: 'Weight Classes',
    description:
      'Set the kg cut-offs that derive a pet’s S/M/L/XL weight class from its assessed weight.',
    to: '/staff/admin/maintenance/weight-classes',
    icon: Scale,
    Component: WeightClassConfigurationPage,
  },
  {
    title: 'Promos & Rewards',
    description:
      'Configure time-limited promotions and spin-wheel rewards, rarity, and the booking/spend thresholds and pity requirement that grant a spin.',
    to: '/staff/admin/maintenance/promos-and-rewards',
    icon: Gift,
    Component: AdminPromosAndRewardsPage,
  },
  {
    title: 'Pets',
    description:
      'Pet types (plus a per-branch fixed price override) and breed management.',
    to: '/staff/admin/maintenance/pets',
    icon: PawPrint,
    Component: AdminPetsPage,
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
    title: 'Cages',
    description: 'Add, edit, delete, or mark a cage Under Maintenance.',
    to: '/staff/admin/hotel/cages',
    icon: DoorOpen,
    Component: AdminCagesPage,
  },
];

/**
 * Renamed from "System Configuration" (session 87) - now a full Notion-style
 * multi-branch browser instead of a single-branch edit form, and folds in
 * what used to be the separate "Policies" tile (below) via each branch
 * row's "Configure" action. Still Superadmin-only, appended conditionally
 * to `CONFIG_TILES` (see SettingsPage.tsx) rather than living in the array
 * itself, same as before its rename.
 */
export const BRANCHES_TILE: ConfigTileConfig = {
  title: 'Branches',
  description:
    'Branch name, address, operating hours, and (per branch) booking policies.',
  to: '/staff/admin/maintenance/branches',
  icon: Building2,
  Component: BranchesPage,
};

/**
 * No longer a listed Config tile (folded into Branches, session 87) - kept
 * resolvable, not listed, so a Branches row's "Configure" action can still
 * navigate to it and have SettingsPage render it inline. Deliberately NOT
 * added to CONFIG_TILES (would reappear in the sidebar/ConfigTab grid) -
 * see HIDDEN_CONFIG_TILES and SettingsPage.tsx's activeConfigTile lookup.
 * The standalone /staff/admin/maintenance/policies route (unscoped, for
 * anyone with an old link) still renders this same PolicyConfigurationPage
 * directly, without going through this constant at all.
 */
export const POLICIES_HIDDEN_TILE: ConfigTileConfig = {
  title: 'Policies',
  description:
    'Reschedule & new-booking notice periods, reschedule fee, Staff Picker, lunch break, payments & downpayment, cancellation credit, credit expiry.',
  to: '/staff/admin/maintenance/policies',
  icon: ScrollText,
  Component: PolicyConfigurationPage,
};

/** Resolvable-but-not-listed tiles - see POLICIES_HIDDEN_TILE's own doc
 * comment for why this can't just live in CONFIG_TILES. */
export const HIDDEN_CONFIG_TILES: ConfigTileConfig[] = [POLICIES_HIDDEN_TILE];
