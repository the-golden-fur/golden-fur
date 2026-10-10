import type { ComponentType } from 'react';
import {
  Building2,
  Calculator,
  DoorOpen,
  Gift,
  MessageCircleQuestion,
  Package,
  PawPrint,
  Percent,
  Scale,
  ScrollText,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { AdminServicesAndPackagesPage } from '../../features/maintenance/pages/AdminServicesAndPackagesPage/AdminServicesAndPackagesPage';
import { PricingConfigurationPage } from '../../features/maintenance/pages/PricingConfigurationPage/PricingConfigurationPage';
import { WeightClassConfigurationPage } from '../../features/maintenance/pages/WeightClassConfigurationPage/WeightClassConfigurationPage';
import { AdminPromosAndRewardsPage } from '../../features/maintenance/pages/AdminPromosAndRewardsPage/AdminPromosAndRewardsPage';
import { AdminPetsPage } from '../../features/maintenance/pages/AdminPetsPage/AdminPetsPage';
import { BranchesPage } from '../../features/maintenance/pages/BranchesPage/BranchesPage';
import { AdminDiscountManagementPage } from '../../features/discounts/pages/AdminDiscountManagementPage/AdminDiscountManagementPage';
import { PolicyConfigurationPage } from '../../features/booking/pages/PolicyConfigurationPage/PolicyConfigurationPage';
import { AdminCagesPage } from '../../features/hotel/pages/AdminCagesPage/AdminCagesPage';
import { FaqConfigurationPage } from '../../features/faq/pages/FaqConfigurationPage/FaqConfigurationPage';
import { VetServicesConfigurationPage } from '../../features/veterinary/pages/VetServicesConfigurationPage/VetServicesConfigurationPage';

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
   * Typed `ComponentType<Record<string, unknown>>` rather than a bare
   * prop-less `ComponentType` (session 87, Branches->Policies pre-scoping)
   * since SettingsPage.tsx can now pass extra props through to whichever
   * tile it renders (`pendingConfigProps`, set via `selectConfigTile`'s
   * second argument) - every tile that doesn't expect any simply ignores
   * them. A component typed with fewer/no declared props is still
   * assignable here (TS allows a function needing fewer args where more
   * are supplied), so every existing zero-prop tile Component below is
   * unaffected. */
  Component: ComponentType<Record<string, unknown>>;
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
    title: 'Promos & Rewards',
    description:
      'Configure promotions (including coupon spin wheels and their trigger conditions), spin-wheel rewards, and reward pools.',
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
    title: 'Discounts',
    description: 'Manage standing discounts, incl. Senior Citizen/PWD.',
    to: '/staff/admin/discounts',
    icon: Percent,
    Component: AdminDiscountManagementPage,
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
 * Superadmin-only, appended conditionally to `CONFIG_TILES` (see
 * SettingsPage.tsx) rather than living in the array itself - same shape as
 * BRANCHES_TILE below. Weight class cut-offs are global (affect every
 * branch's Grooming pricing and Hotel/Daycare cage sizing at once), so an
 * Admin - scoped to their own branch everywhere else in Config - has no
 * access to this tile at all, not even read-only. WeightClassConfigurationPage
 * itself also enforces this (ALLOWED_VIEWER_ROLES), so direct navigation to
 * its route doesn't bypass this.
 */
export const WEIGHT_CLASSES_TILE: ConfigTileConfig = {
  title: 'Weight Classes',
  description:
    'Set the kg cut-offs that derive a pet’s S/M/L/XL weight class from its assessed weight.',
  to: '/staff/admin/maintenance/weight-classes',
  icon: Scale,
  Component: WeightClassConfigurationPage,
};

/**
 * Superadmin-only, appended conditionally to `CONFIG_TILES` (see
 * SettingsPage.tsx), same shape as WEIGHT_CLASSES_TILE above: the help
 * mascot's FAQs are one list shown to every visitor at every branch, so a
 * branch-scoped Admin has no access. FaqConfigurationPage enforces this too
 * (ALLOWED_VIEWER_ROLES), as do the server's /maintenance/faqs routes.
 */
export const FAQS_TILE: ConfigTileConfig = {
  title: 'Mascot FAQs',
  description:
    'Set the questions and answers behind the help mascot’s FAQs button.',
  to: '/staff/admin/maintenance/faqs',
  icon: MessageCircleQuestion,
  Component: FaqConfigurationPage,
};

/**
 * Superadmin-only, appended conditionally to `CONFIG_TILES` (see
 * SettingsPage.tsx), same shape as FAQS_TILE above: the vet procedure list
 * (services and usual prices a vet picks from when completing a visit) is one
 * list for every branch. VetServicesConfigurationPage enforces this too
 * (ALLOWED_VIEWER_ROLES), as do the server's /veterinary/service-catalog
 * routes. The services customers book stay under Services and Packages.
 */
export const VET_SERVICES_TILE: ConfigTileConfig = {
  title: 'Veterinary Services',
  description:
    'Set the services and usual prices vets choose from when completing a visit.',
  to: '/staff/admin/maintenance/veterinary-services',
  icon: Stethoscope,
  Component: VetServicesConfigurationPage,
};

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
 * resolvable, not listed, so an old Policies link still lands on it inside
 * Settings. A Branches row's "Configure" now opens a modal (branch details +
 * these policies, embedded) instead of navigating here. Deliberately NOT
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
