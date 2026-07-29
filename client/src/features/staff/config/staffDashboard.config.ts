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
        title: 'Services',
        description: 'Manage the service catalog.',
        to: '/staff/admin/maintenance/services',
      },
      {
        title: 'Pricing Configuration',
        description: 'Set the shared grooming size/coat pricing calculation.',
        to: '/staff/admin/maintenance/pricing-configuration',
      },
      {
        title: 'Packages',
        description: 'Bundle services into sellable packages.',
        to: '/staff/admin/maintenance/packages',
      },
      {
        title: 'Promos',
        description: 'Configure time-limited promotions.',
        to: '/staff/admin/maintenance/promos',
      },
      {
        title: 'Promo Cap Configuration',
        description:
          'Set the per-branch and system-wide cap on combined promo discounts.',
        to: '/staff/admin/maintenance/promo-cap-configuration',
      },
      {
        title: 'Breed Management',
        description: 'Add, rename, or remove breeds available on pet profiles.',
        to: '/staff/admin/maintenance/breeds',
      },
      {
        title: 'Hotel Food Catalog',
        description: 'Manage hotel-suppliable food items and their prices.',
        to: '/staff/hotel/food-catalog',
      },
      {
        title: 'Hotel Medication Catalog',
        description: 'Manage hotel-suppliable medications and their prices.',
        to: '/staff/hotel/medication-catalog',
      },
      {
        title: 'Discounts',
        description: 'Manage standing discounts, incl. Senior Citizen/PWD.',
        to: '/staff/admin/discounts',
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
        title: 'System Configuration',
        description:
          'Superadmin only - branch name, address, and operating hours.',
        to: '/staff/admin/maintenance/system-configuration',
      },
    ],
  },
  supervisor: {
    heading: 'Supervisor dashboard',
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
        description: 'Branch-wide performance reporting.',
      },
    ],
  },
  receptionist: {
    heading: 'Receptionist dashboard',
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
        title: 'Hotel Check-in',
        description: 'Cage assignment and care instructions capture.',
        to: '/staff/hotel/check-in',
      },
      {
        title: 'Hotel Checkout',
        description: 'Extension fees, billing handoff, and cage release.',
        to: '/staff/hotel/checkout',
      },
      {
        title: 'Daycare Check-in',
        description: 'Check pets in and out of daycare sessions.',
        to: '/staff/daycare/check-in',
      },
    ],
  },
  groomer: {
    heading: 'Groomer dashboard',
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
    ],
  },
  veterinarian: {
    heading: 'Veterinarian dashboard',
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
  cashier: {
    heading: 'Cashier dashboard',
    tiles: [
      {
        title: 'Days Off',
        description: 'Request a day off, or take the rest of today off.',
        to: '/staff/days-off',
      },
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
        title: 'Days Off',
        description: 'Request a day off, or take the rest of today off.',
        to: '/staff/days-off',
      },
      {
        title: 'Care Log',
        description: "Today's feeding, walking, and medication checklist.",
        to: '/staff/hotel/care-log',
      },
    ],
  },
};
