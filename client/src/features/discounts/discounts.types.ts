/**
 * Client-side mirror of server/src/features/discounts/discounts.types.ts.
 * M12 Discounts lives in its own feature folder, separate from
 * features/maintenance/ (M13) - distinct modules per Modules-Overview even
 * though Sprint 2 builds/ships them together (#43 Dev Notes).
 */

export type DiscountValueType = 'Percentage' | 'Flat';

export type DiscountScopeType = 'service' | 'package' | 'category';

export type DiscountCategory =
  | 'Grooming'
  | 'Hotel'
  | 'Daycare'
  | 'Veterinary'
  | 'Misc';

export const DISCOUNT_CATEGORIES: DiscountCategory[] = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Misc',
];

/** Custom change: mirrors ServiceBranchAvailability/PackageBranchAvailability
 * - replaces the discount's original single branch_id column (admin
 * settings > discount builder branch multiselect). */
export interface DiscountBranchAvailability {
  discount_id: string;
  branch_id: string;
  is_available: boolean;
}

export interface Discount {
  id: string;
  name: string;
  /**
   * True only for the seeded Senior Citizen / PWD rows (#44). Their name and
   * this flag are immutable via the API (#43 AC-3) - the UI mirrors that by
   * making the name field read-only when is_mandated is true.
   */
  is_mandated: boolean;
  discount_type: DiscountValueType;
  value: number;
  scope_type: DiscountScopeType;
  scope_service_id: string | null;
  scope_package_id: string | null;
  scope_category: DiscountCategory | null;
  /**
   * Custom change (unify active/available): derived from branch
   * availability, not independently settable - true whenever at least one
   * discount_branch_availability row for this discount has is_available
   * true. The server keeps this in sync on every branch-availability write;
   * it's still a real field to read (list filters, the archive guard), just
   * never sent on create/update payloads any more.
   */
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  discount_branch_availability?: DiscountBranchAvailability[];
}

/** is_mandated is deliberately absent - never settable via the API.
 * branch_ids (custom change) replaces the old single branch_id. */
export interface CreateDiscountPayload {
  branch_ids: string[];
  name: string;
  discount_type: DiscountValueType;
  value: number;
  scope_type: DiscountScopeType;
  scope_service_id?: string;
  scope_package_id?: string;
  scope_category?: DiscountCategory;
}

export interface DiscountBranchAvailabilityPayload {
  branch_id: string;
  is_available: boolean;
}

/** is_active is deliberately absent - derived from branch availability, not
 * independently settable (see Discount.is_active). */
export interface UpdateDiscountPayload {
  name?: string;
  discount_type?: DiscountValueType;
  value?: number;
  scope_type?: DiscountScopeType;
  scope_service_id?: string;
  scope_package_id?: string;
  scope_category?: DiscountCategory;
}
