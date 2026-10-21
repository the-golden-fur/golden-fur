/**
 * M12 Discounts lives in its own feature folder, separate from
 * features/maintenance/ - M12 and M13 are distinct modules per
 * Modules-Overview even though Sprint 2 builds and ships them together.
 * Role lists are feature-local, mirroring the project convention.
 */
export const DISCOUNT_READ_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
  'Front Desk',
];

export const DISCOUNT_WRITE_ROLES: readonly string[] = ['Admin', 'Superadmin'];

export type DiscountValueType = 'Percentage' | 'Flat';

/** 'misc_sale' (session 115): applies to any miscellaneous sale, no further
 * sub-scoping - scope_service_id/scope_package_id/scope_category all stay
 * NULL for it, mirroring how a promo's 'all_services' scope needs no scope
 * row either. */
export type DiscountScopeType =
  | 'service'
  | 'package'
  | 'category'
  | 'misc_sale';

export type DiscountCategory =
  | 'Grooming'
  | 'Hotel'
  | 'Daycare'
  | 'Veterinary'
  | 'Assessment';

/** Custom change: mirrors ServiceBranchAvailability/PackageBranchAvailability
 * - replaces the discount's original single branch_id column. */
export interface DiscountBranchAvailability {
  discount_id: string;
  branch_id: string;
  is_available: boolean;
}

export interface Discount {
  id: string;
  name: string;
  /**
   * True only for the seeded Senior Citizen / PWD rows (#44). Informational
   * - mandated rows share the custom CRUD path - and this flag is immutable
   * (#43 AC-3). The name is now editable: checkout identifies these rows by
   * mandated_kind, not by name.
   */
  is_mandated: boolean;
  /** Stable identity of a mandated discount, used by checkout's eligibility
   * gate (20260928220). null for custom discounts. */
  mandated_kind: 'senior_citizen' | 'pwd' | null;
  discount_type: DiscountValueType;
  value: number;
  scope_type: DiscountScopeType;
  scope_service_id: string | null;
  scope_package_id: string | null;
  scope_category: DiscountCategory | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  discount_branch_availability?: DiscountBranchAvailability[];
}
