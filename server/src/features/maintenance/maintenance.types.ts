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

/**
 * One cell of the Grooming size x coat matrix, as returned by the API.
 * Epic B (#80/#81): derived on read from base_price + pricing_configuration
 * via deriveGroomingMatrix, no longer stored per-cell - id/service_id are
 * synthesized (not real row ids) so this shape stays unchanged for existing
 * consumers (booking.service.ts's resolveServicePrice, this feature's own
 * client pages).
 */
export interface ServicePricingTier {
  id: string;
  service_id: string;
  weight_class: WeightClass;
  coat_type: CoatType;
  price: number;
}

/** Epic B (#80): the shared, singleton grooming size/coat calculation. */
export interface PricingConfiguration {
  id: string;
  size_s_multiplier: number;
  size_m_multiplier: number;
  size_l_multiplier: number;
  size_xl_multiplier: number;
  long_coat_addon: number;
  updated_by_staff_id: string | null;
  updated_at: string;
}

/** Epic B (#82): the shared, singleton package bundled-price calculation. */
export interface PackagePricingConfiguration {
  id: string;
  bundle_discount_percentage: number;
  updated_by_staff_id: string | null;
  updated_at: string;
}

export type CapType = 'percentage' | 'flat';

/** Epic B (#84): per-branch (NULL = both branches) promo cap. */
export interface PromoCapConfiguration {
  id: string;
  branch_id: string | null;
  cap_type: CapType;
  cap_value: number;
  updated_by_staff_id: string | null;
  updated_at: string;
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
  /**
   * Epic B (#82/#83): derived on read from included services' base_price and
   * package_pricing_configuration via deriveBundledPrice, no longer a stored
   * column - the field name/shape is unchanged so existing consumers
   * (booking.service.ts) need no changes.
   */
  bundled_price: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  package_services?: Array<{ service_id: string }>;
}

/** Same vocabulary as M02 pets.pet_type. */
export type PetType = 'Dog' | 'Cat';

export interface Breed {
  id: string;
  pet_type: PetType;
  name: string;
  created_at: string;
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
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  promo_scope?: PromoScopeItem[];
}
