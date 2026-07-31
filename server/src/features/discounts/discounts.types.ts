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
];

export const DISCOUNT_WRITE_ROLES: readonly string[] = ['Admin', 'Superadmin'];

export type DiscountValueType = 'Percentage' | 'Flat';

export type DiscountScopeType = 'service' | 'package' | 'category';

export type DiscountCategory = 'Grooming' | 'Hotel' | 'Daycare' | 'Veterinary';

export interface Discount {
  id: string;
  branch_id: string;
  name: string;
  /**
   * True only for the seeded Senior Citizen / PWD rows (#44). Informational
   * - mandated rows share the custom CRUD path - but their name and this
   * flag are immutable (#43 AC-3).
   */
  is_mandated: boolean;
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
}
