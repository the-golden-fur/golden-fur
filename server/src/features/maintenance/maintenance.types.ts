/**
 * Feature-local role lists (mirrors how customers/ defines
 * CUSTOMER_MANAGER_ROLES rather than importing across features). Reads are
 * open to every authenticated staff role; writes are Admin/Superadmin only,
 * matching the two-tier RLS on every M13/M12 table.
 */
export const MAINTENANCE_READ_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
];

export const MAINTENANCE_WRITE_ROLES: readonly string[] = [
  'Admin',
  'Superadmin',
];

export type ServiceCategory = 'Grooming' | 'Hotel' | 'Daycare' | 'Veterinary';

export type DiscountValueType = 'Percentage' | 'Flat';

/** Same vocabulary as M02 pets.weight_class / pets.coat_type. */
export type WeightClass = 'S' | 'M' | 'L' | 'XL';
export type CoatType = 'SC' | 'LC';

export interface ServicePricingTier {
  id: string;
  service_id: string;
  weight_class: WeightClass;
  coat_type: CoatType;
  price: number;
}

export interface ServiceBranchAvailability {
  service_id: string;
  branch_id: string;
  is_available: boolean;
}

export interface Service {
  id: string;
  category: ServiceCategory;
  name: string;
  base_price: number;
  duration_minutes: number | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  service_pricing_tiers?: ServicePricingTier[];
  service_branch_availability?: ServiceBranchAvailability[];
}

export interface PackageServiceLink {
  package_id: string;
  service_id: string;
}

export interface Package {
  id: string;
  branch_id: string;
  name: string;
  bundled_price: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  package_services?: Array<{ service_id: string }>;
}

export type PromoScopeType = 'all_services' | 'specific';
export type PromoBranchScope = 'makati' | 'southwoods' | 'both';

export interface PromoScopeItem {
  id: string;
  promo_id: string;
  service_id: string | null;
  package_id: string | null;
}

export interface Promo {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  condition_note: string | null;
  discount_type: DiscountValueType;
  value: number;
  scope_type: PromoScopeType;
  branch_scope: PromoBranchScope;
  is_exclusive: boolean;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  promo_scope?: PromoScopeItem[];
}
