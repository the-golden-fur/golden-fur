/**
 * Client-side mirror of server/src/features/discounts/discounts.types.ts.
 * M12 Discounts lives in its own feature folder, separate from
 * features/maintenance/ (M13) - distinct modules per Modules-Overview even
 * though Sprint 2 builds/ships them together (#43 Dev Notes).
 */

export type DiscountValueType = 'Percentage' | 'Flat';

export type DiscountScopeType = 'service' | 'package' | 'category';

export type DiscountCategory = 'Grooming' | 'Hotel' | 'Daycare' | 'Veterinary';

export const DISCOUNT_CATEGORIES: DiscountCategory[] = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
];

export interface Discount {
  id: string;
  branch_id: string;
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
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** is_mandated is deliberately absent - never settable via the API. */
export interface CreateDiscountPayload {
  branch_id: string;
  name: string;
  discount_type: DiscountValueType;
  value: number;
  scope_type: DiscountScopeType;
  scope_service_id?: string;
  scope_package_id?: string;
  scope_category?: DiscountCategory;
}

export interface UpdateDiscountPayload {
  name?: string;
  discount_type?: DiscountValueType;
  value?: number;
  is_active?: boolean;
  scope_type?: DiscountScopeType;
  scope_service_id?: string;
  scope_package_id?: string;
  scope_category?: DiscountCategory;
}
