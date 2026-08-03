/**
 * Sprint 5 unification (#82): replaces the hotel feature's
 * FoodCatalogItem/MedicationCatalogItem - one shared product_catalog table,
 * differentiated by category ('food' | 'medication' | 'misc_retail', ...)
 * and service_scope ('hotel' | 'general', ...). Plain strings, not a closed
 * union, matching the server's own documented-not-enforced convention -
 * see server/src/features/catalog/catalog.types.ts.
 */
export interface ProductCatalogItem {
  id: string;
  name: string;
  category: string;
  service_scope: string;
  price: number;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  /** Null = staff/global catalog entry; set = one customer's own private
   * food/medication type (#22). */
  owner_customer_id: string | null;
}

export type CustomerCatalogCategory = 'food' | 'medication';

export interface CreateProductPayload {
  name: string;
  category: string;
  service_scope: string;
  price: number;
}

export interface UpdateProductPayload {
  name?: string;
  category?: string;
  service_scope?: string;
  price?: number;
  is_active?: boolean;
}

export interface ListProductsFilter {
  category?: string;
  service_scope?: string;
  active_only?: boolean;
}
