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

export interface StaffDashboardConfig {
  heading: string;
  tiles: DashboardTileConfig[];
}

/**
 * Which tiles are links vs. placeholders mirrors what's actually routed
 * today (staff.routes.ts / maintenance.routes.tsx) and each page's own
 * ALLOWED_VIEWER_ROLES gate - not a guess at future scope. Placeholder
 * tiles name the module each role owns per the Modules-Features doc
 * (M03 Receptionist queue, M04 Groomer, M05 Pet Assistant, M07 Veterinarian,
 * M08 Cashier, M14 Supervisor/Admin reporting) so the dashboard shape won't
 * need to change shape when those modules ship - only the tile gains a `to`.
 */
export const STAFF_DASHBOARD_CONFIG: Record<
  StaffDashboardSlug,
  StaffDashboardConfig
> = {
  admin: {
    heading: 'Admin dashboard',
    tiles: [
      {
        title: 'Staff Directory',
        description: 'Create, promote, and manage staff accounts.',
        to: '/staff/admin/staff',
      },
      {
        title: 'Customer Directory',
        description: 'Look up customers, pets, and walk-in records.',
        to: '/staff/admin/customers',
      },
      {
        title: 'Unavailability Approval Queue',
        description: 'Review pending staff unavailability requests.',
        to: '/staff/admin/unavailability',
      },
      {
        title: 'Services',
        description: 'Manage the service catalog and pricing tiers.',
        to: '/staff/admin/maintenance/services',
      },
      {
        title: 'Packages',
        description: 'Bundle services into sellable packages.',
        to: '/staff/admin/maintenance/packages',
      },
    ],
  },
  supervisor: {
    heading: 'Supervisor dashboard',
    tiles: [
      {
        title: 'Customer Directory',
        description: 'Look up customers, pets, and walk-in records.',
        to: '/staff/admin/customers',
      },
      {
        title: 'Unavailability Approval Queue',
        description: 'Review pending staff unavailability requests.',
        to: '/staff/admin/unavailability',
      },
      {
        title: 'Branch Reports',
        description: 'Branch-wide performance and end-of-day care log flags.',
      },
    ],
  },
  receptionist: {
    heading: 'Receptionist dashboard',
    tiles: [
      {
        title: 'Customer Directory',
        description: 'Look up customers, pets, and walk-in records.',
        to: '/staff/admin/customers',
      },
      {
        title: 'Bookings Queue',
        description: "Today's confirmed bookings for the front desk.",
      },
      {
        title: 'Hotel Check-in',
        description: 'Cage assignment and care instructions capture.',
      },
      {
        title: 'Daycare Check-in',
        description: 'Check pets in and out of daycare sessions.',
      },
    ],
  },
  groomer: {
    heading: 'Groomer dashboard',
    tiles: [
      {
        title: 'Grooming Queue',
        description: "Today's grooming appointments and status updates.",
      },
    ],
  },
  veterinarian: {
    heading: 'Veterinarian dashboard',
    tiles: [
      {
        title: 'Consultation Queue',
        description: "Today's consultations and pet medical history.",
      },
    ],
  },
  cashier: {
    heading: 'Cashier dashboard',
    tiles: [
      {
        title: 'Checkout & Billing',
        description: 'Assemble charges, apply discounts, and take payment.',
      },
    ],
  },
  'pet-assistant': {
    heading: 'Pet Assistant dashboard',
    tiles: [
      {
        title: 'Care Log',
        description: "Today's feeding, walking, and medication checklist.",
      },
    ],
  },
};
