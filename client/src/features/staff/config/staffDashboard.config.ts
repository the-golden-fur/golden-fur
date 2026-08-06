import {
  Archive,
  BarChart3,
  CalendarCheck,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  Coins,
  DoorOpen,
  Heart,
  LogIn,
  Receipt,
  Scissors,
  Stethoscope,
  UserCog,
  Users,
  UserSearch,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { StaffRole } from '../staff.types';

export type StaffDashboardSlug =
  | 'admin'
  | 'supervisor'
  | 'receptionist'
  | 'groomer'
  | 'veterinarian'
  | 'cashier'
  | 'pet-assistant';

/**
 * Superadmin and Admin share the 'admin' dashboard - they share the same
 * ADMIN_ROLES permission tier server-side (staff.types.ts/maintenance.types.ts),
 * so there's nothing role-specific to split between them client-side either.
 */
export const ROLE_TO_DASHBOARD_SLUG: Record<StaffRole, StaffDashboardSlug> = {
  Superadmin: 'admin',
  Admin: 'admin',
  Supervisor: 'supervisor',
  Receptionist: 'receptionist',
  Groomer: 'groomer',
  Veterinarian: 'veterinarian',
  Cashier: 'cashier',
  'Pet Assistant': 'pet-assistant',
};

export interface DashboardTileConfig {
  title: string;
  description: string;
  /** Omitted for modules not built yet - the tile renders as "Coming soon". */
  to?: string;
}

export interface DashboardSectionConfig {
  /** null renders with no heading - every non-admin role has exactly one
   * such section, so their dashboard/sidebar looks like a flat list, same as
   * before sections existed. */
  label: string | null;
  tiles: DashboardTileConfig[];
}

export interface StaffDashboardConfig {
  heading: string;
  sections: DashboardSectionConfig[];
}

/**
 * Admin/Superadmin already pass the `ALLOWED_VIEWER_ROLES` gate (and the
 * server's `requireRole`) on every one of these routes - confirmed by
 * reading each page's own gate before writing this config. Grouping their
 * dashboard into sections is a navigation-surfacing change, not a
 * permissions change: it just makes visible the fact that Admin/Superadmin
 * can already act as any lower-privilege role (Groomer, Receptionist, Vet,
 * etc.), one section per role, plus their own Management section.
 *
 * Pure admin-config tools (Services, Pricing, Packages, Promos, Breeds,
 * Hotel catalogs, Discounts, System Configuration) are deliberately NOT
 * here - they moved to Settings > Config (see SettingsPage's ConfigTab),
 * since day-to-day operational navigation and admin configuration are two
 * different concerns.
 */
export const STAFF_DASHBOARD_CONFIG: Record<
  StaffDashboardSlug,
  StaffDashboardConfig
> = {
  admin: {
    heading: 'Admin dashboard',
    sections: [
      {
        label: 'Management',
        tiles: [
          {
            title: 'Days Off',
            description: 'Request a day off, or take the rest of today off.',
            to: '/staff/days-off',
          },
          {
            title: 'Staff Management',
            description: 'Create, promote, and manage staff accounts.',
            to: '/staff/admin/staff',
          },
          {
            title: 'Customer Management',
            description: 'Look up customers, pets, and walk-in records.',
            to: '/staff/admin/customers',
          },
          {
            title: 'Days Off Approval Queue',
            description: 'Review pending staff day-off requests.',
            to: '/staff/admin/unavailability',
          },
          {
            title: 'Monthly Schedule',
            description:
              'Plot rest days and vacation/sick leave on a branch-wide calendar.',
            to: '/staff/admin/monthly-schedule',
          },
          {
            title: 'Bookings Queue',
            description:
              'Branch-wide booking queue - reschedule, cancel, or start a new walk-in booking.',
            to: '/staff/bookings/queue',
          },
          {
            title: 'Archive',
            description:
              'Restore or permanently delete archived products, staff, and customers.',
            to: '/staff/admin/archive',
          },
        ],
      },
      {
        label: 'Receptionist',
        tiles: [
          {
            title: 'Hotel Queue',
            description:
              'Check pets in and out, cage assignment, and billing handoff.',
            to: '/staff/hotel/queue',
          },
          {
            title: 'Daycare Queue',
            description: 'Check pets in and out of daycare sessions.',
            to: '/staff/daycare/queue',
          },
        ],
      },
      {
        label: 'Groomer',
        tiles: [
          {
            title: 'Grooming Queue',
            description: "Today's grooming appointments and status updates.",
            to: '/staff/grooming/queue',
          },
        ],
      },
      {
        label: 'Veterinarian',
        tiles: [
          {
            title: 'Consultation Queue',
            description: "Today's consultations and pet medical history.",
            to: '/staff/veterinary/console',
          },
        ],
      },
      {
        label: 'Cashier',
        tiles: [
          {
            title: 'Checkout & Billing',
            description: 'Assemble charges, apply discounts, and take payment.',
          },
          {
            title: 'Credit Management',
            description:
              "Look up a customer's branch credit balance, history, and expiry.",
            to: '/staff/credits',
          },
        ],
      },
      {
        label: 'Pet Assistant',
        tiles: [
          {
            title: 'Hotel Care Log',
            description: 'End-of-day uncompleted care log flags.',
            to: '/staff/hotel/care-log',
          },
        ],
      },
      {
        label: 'Supervisor',
        tiles: [
          {
            title: 'Branch Reports',
            description:
              'Daily Sales Report - branch-wide performance reporting.',
            to: '/staff/reports/dsr',
          },
          {
            title: 'Cage Occupancy',
            description: 'Real-time cage availability by size category.',
            to: '/staff/reports/cage-occupancy',
          },
          {
            title: 'Transaction History',
            description:
              'Search past transactions by customer, pet, date, or service.',
            to: '/staff/reports/transaction-history',
          },
        ],
      },
    ],
  },
  supervisor: {
    heading: 'Supervisor dashboard',
    sections: [
      {
        label: null,
        tiles: [
          {
            title: 'Days Off',
            description: 'Request a day off, or take the rest of today off.',
            to: '/staff/days-off',
          },
          {
            title: 'Customer Management',
            description: 'Look up customers, pets, and walk-in records.',
            to: '/staff/admin/customers',
          },
          {
            title: 'Days Off Approval Queue',
            description: 'Review pending staff day-off requests.',
            to: '/staff/admin/unavailability',
          },
          {
            title: 'Monthly Schedule',
            description:
              'Plot rest days and vacation/sick leave on a branch-wide calendar.',
            to: '/staff/admin/monthly-schedule',
          },
          {
            title: 'Bookings Queue',
            description:
              'Branch-wide booking queue - reschedule, cancel, or start a new walk-in booking.',
            to: '/staff/bookings/queue',
          },
          {
            title: 'Hotel Care Log',
            description: 'End-of-day uncompleted care log flags.',
            to: '/staff/hotel/care-log',
          },
          {
            title: 'Branch Reports',
            description:
              'Daily Sales Report - branch-wide performance reporting.',
            to: '/staff/reports/dsr',
          },
          {
            title: 'Cage Occupancy',
            description: 'Real-time cage availability by size category.',
            to: '/staff/reports/cage-occupancy',
          },
          {
            title: 'Transaction History',
            description:
              'Search past transactions by customer, pet, date, or service.',
            to: '/staff/reports/transaction-history',
          },
        ],
      },
    ],
  },
  receptionist: {
    heading: 'Receptionist dashboard',
    sections: [
      {
        label: null,
        tiles: [
          {
            title: 'Days Off',
            description: 'Request a day off, or take the rest of today off.',
            to: '/staff/days-off',
          },
          {
            title: 'Customer Management',
            description: 'Look up customers, pets, and walk-in records.',
            to: '/staff/admin/customers',
          },
          {
            title: 'Bookings Queue',
            description: "Today's confirmed bookings for the front desk.",
            to: '/staff/bookings/queue',
          },
          {
            title: 'Hotel Queue',
            description:
              'Check pets in and out, cage assignment, and billing handoff.',
            to: '/staff/hotel/queue',
          },
          {
            title: 'Daycare Queue',
            description: 'Check pets in and out of daycare sessions.',
            to: '/staff/daycare/queue',
          },
        ],
      },
    ],
  },
  groomer: {
    heading: 'Groomer dashboard',
    sections: [
      {
        label: null,
        tiles: [
          {
            title: 'Days Off',
            description: 'Request a day off, or take the rest of today off.',
            to: '/staff/days-off',
          },
          {
            title: 'Grooming Queue',
            description: "Today's grooming appointments and status updates.",
            to: '/staff/grooming/queue',
          },
          {
            title: 'Hotel Queue',
            description:
              'Check pets in and out, cage assignment, and billing handoff.',
            to: '/staff/hotel/queue',
          },
          {
            title: 'Daycare Queue',
            description: 'Check pets in and out of daycare sessions.',
            to: '/staff/daycare/queue',
          },
        ],
      },
    ],
  },
  veterinarian: {
    heading: 'Veterinarian dashboard',
    sections: [
      {
        label: null,
        tiles: [
          {
            title: 'Days Off',
            description: 'Request a day off, or take the rest of today off.',
            to: '/staff/days-off',
          },
          {
            title: 'Consultation Queue',
            description: "Today's consultations and pet medical history.",
            to: '/staff/veterinary/console',
          },
        ],
      },
    ],
  },
  cashier: {
    heading: 'Cashier dashboard',
    sections: [
      {
        label: null,
        tiles: [
          {
            title: 'Days Off',
            description: 'Request a day off, or take the rest of today off.',
            to: '/staff/days-off',
          },
          {
            title: 'Bookings Queue',
            description:
              'Branch-wide booking queue - view every status and mark completed bookings as paid.',
            to: '/staff/bookings/queue',
          },
          {
            title: 'Checkout & Billing',
            description: 'Assemble charges, apply discounts, and take payment.',
          },
          {
            title: 'Credit Management',
            description:
              "Look up a customer's branch credit balance, history, and expiry.",
            to: '/staff/credits',
          },
        ],
      },
    ],
  },
  'pet-assistant': {
    heading: 'Pet Assistant dashboard',
    sections: [
      {
        label: null,
        tiles: [
          {
            title: 'Days Off',
            description: 'Request a day off, or take the rest of today off.',
            to: '/staff/days-off',
          },
          {
            title: 'Care Log',
            description: "Today's feeding, walking, and medication checklist.",
            to: '/staff/hotel/care-log',
          },
          {
            title: 'Hotel Queue',
            description:
              'Check pets in and out, cage assignment, and billing handoff.',
            to: '/staff/hotel/queue',
          },
          {
            title: 'Daycare Queue',
            description: 'Check pets in and out of daycare sessions.',
            to: '/staff/daycare/queue',
          },
        ],
      },
    ],
  },
};

/** Icon per admin dashboard section label, used by the Sidebar (AppShell) -
 * every non-admin role's single `label: null` section renders with no icon,
 * matching its flat pre-sidebar look. */
const ADMIN_SECTION_ICONS: Record<string, LucideIcon> = {
  Management: Users,
  Receptionist: ClipboardList,
  Groomer: Scissors,
  Veterinarian: Stethoscope,
  Cashier: Wallet,
  'Pet Assistant': Heart,
  Supervisor: BarChart3,
};

/** Per-tile icon, keyed by title so every dashboard config sharing a tile
 * (e.g. every role has its own "Days Off") gets the same icon without
 * repeating it on each tile definition above. */
const TILE_ICONS: Record<string, LucideIcon> = {
  'Days Off': CalendarOff,
  'Staff Management': UserCog,
  'Customer Management': UserSearch,
  'Days Off Approval Queue': ClipboardCheck,
  'Bookings Queue': CalendarCheck,
  Archive,
  'Hotel Queue': LogIn,
  'Daycare Queue': LogIn,
  'Grooming Queue': Scissors,
  'Consultation Queue': Stethoscope,
  'Checkout & Billing': Wallet,
  'Credit Management': Coins,
  'Hotel Care Log': Heart,
  'Care Log': Heart,
  'Branch Reports': BarChart3,
  'Cage Occupancy': DoorOpen,
  'Transaction History': Receipt,
};

export interface SidebarReadySection {
  label: string | null;
  icon?: LucideIcon;
  items: { title: string; to: string; icon?: LucideIcon }[];
}

/** Flattens a StaffDashboardConfig's sections into Sidebar-ready sections:
 * drops the `description` field DashboardTile needs but Sidebar doesn't, and
 * drops tiles with no `to` (a "Coming soon" placeholder isn't a nav target). */
export function toSidebarSections(
  config: StaffDashboardConfig
): SidebarReadySection[] {
  return config.sections
    .map((section) => ({
      label: section.label,
      icon: section.label ? ADMIN_SECTION_ICONS[section.label] : undefined,
      items: section.tiles
        .filter((tile): tile is DashboardTileConfig & { to: string } =>
          Boolean(tile.to)
        )
        .map((tile) => ({
          title: tile.title,
          to: tile.to,
          icon: TILE_ICONS[tile.title],
        })),
    }))
    .filter((section) => section.items.length > 0);
}
