/**
 * Feature-local role lists (mirrors discounts.types.ts / hotel.types.ts).
 * Read access is intentionally "any staff role" - it must include Cashier
 * (for Misc Sale, #85/#87) alongside the front-desk/assistant roles that
 * used to be the only readers back when this was two hotel-only catalogs
 * (food_catalog/medication_catalog) - matches the open-SELECT RLS policy on
 * product_catalog (migration 20260731067).
 */
export const CATALOG_READ_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
];

export const CATALOG_WRITE_ROLES: readonly string[] = ['Admin', 'Superadmin'];

/**
 * Plain text, not a union/enum - matching product_catalog's own migration
 * comment: category/service_scope are documented, extensible values, not
 * DB- or type-enforced, so a future category (e.g. a grooming retail
 * product) never needs a schema migration or a type change here.
 * Documented as of this feature: category in
 * ('food', 'medication', 'misc_retail'), service_scope in
 * ('hotel', 'general').
 */
export interface ProductCatalogItem {
  id: string;
  name: string;
  category: string;
  service_scope: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
