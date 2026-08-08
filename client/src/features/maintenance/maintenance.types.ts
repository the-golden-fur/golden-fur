/**
 * Client-side mirrors of server/src/features/maintenance/maintenance.types.ts
 * (the DB Design sheet's shapes), plus the request payloads accepted by the
 * #40/#41 validators. Kept at the feature root like staff.types.ts.
 */

export type ServiceCategory =
  | 'Grooming'
  | 'Hotel'
  | 'Daycare'
  | 'Veterinary'
  | 'Misc';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Misc',
];

/** Same vocabulary as M02 pets.weight_class / pets.coat_type. */
export type WeightClass = 'S' | 'M' | 'L' | 'XL';
export type CoatType = 'SC' | 'LC';

export const WEIGHT_CLASSES: WeightClass[] = ['S', 'M', 'L', 'XL'];
export const COAT_TYPES: CoatType[] = ['SC', 'LC'];

/**
 * One cell of the Grooming size x coat matrix, as returned by the API.
 * Epic B (#80/#81): derived server-side from base_price + pricing_configuration,
 * no longer editable per-cell - id/service_id are synthesized.
 */
export interface ServicePricingTier {
  id: string;
  service_id: string;
  weight_class: WeightClass;
  coat_type: CoatType;
  price: number;
}

/** Custom change (configurable pricing rules): each size (and Long coat)
 * derives its own adjustment independently - a flat multiplier is no longer
 * the only option. `percentage` is always a percentage of the service's own
 * base_price, never of another rule's already-adjusted result. */
export type PricingRuleType = 'multiplier' | 'flat' | 'percentage';

export const PRICING_RULE_TYPES: PricingRuleType[] = [
  'multiplier',
  'flat',
  'percentage',
];

/** Epic B (#80): the shared, singleton grooming size/coat calculation.
 * daycare_overnight_fee used to live here too (#22) but moved to
 * Service.daycare_overnight_fee (Custom change: Daycare fee configuration)
 * - a per-service fee, not a Grooming pricing rule. */
export interface PricingConfiguration {
  id: string;
  size_s_rule_type: PricingRuleType;
  size_s_rule_value: number;
  size_m_rule_type: PricingRuleType;
  size_m_rule_value: number;
  size_l_rule_type: PricingRuleType;
  size_l_rule_value: number;
  size_xl_rule_type: PricingRuleType;
  size_xl_rule_value: number;
  coat_long_rule_type: PricingRuleType;
  coat_long_rule_value: number;
  updated_by_staff_id: string | null;
  updated_at: string;
}

export interface UpdatePricingConfigurationPayload {
  size_s_rule_type?: PricingRuleType;
  size_s_rule_value?: number;
  size_m_rule_type?: PricingRuleType;
  size_m_rule_value?: number;
  size_l_rule_type?: PricingRuleType;
  size_l_rule_value?: number;
  size_xl_rule_type?: PricingRuleType;
  size_xl_rule_value?: number;
  coat_long_rule_type?: PricingRuleType;
  coat_long_rule_value?: number;
}

/** Epic B (#82): the shared, singleton package bundled-price calculation. */
export interface PackagePricingConfiguration {
  id: string;
  bundle_discount_percentage: number;
  updated_by_staff_id: string | null;
  updated_at: string;
}

export interface UpdatePackagePricingConfigurationPayload {
  bundle_discount_percentage: number;
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

export interface UpsertPromoCapConfigurationPayload {
  branch_id?: string | null;
  cap_type: CapType;
  cap_value: number;
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
  /** Whether a pet with no recorded weight_class/coat_type (never staff-
   * assessed onsite) may book this service - false only for the seeded
   * "Initial Assessment" service. Client interview finding: customers
   * couldn't be trusted to self-report weight/coat, so an unassessed pet
   * is locked out of every other service until staff records this. */
  requires_assessed_pet: boolean;
  /** Hotel-only: booking this service for this many nights or more
   * auto-awards free_package_name as a zero-priced line item. NULL = no
   * free-package condition. */
  min_nights_for_free_package: number | null;
  /** Hotel-only: matched against a package's name at the booking's own
   * branch (packages are branch-scoped; this services row is not). */
  free_package_name: string | null;
  /** Whether this service's price varies by the pet's weight_class/
   * coat_type (Grooming only). Ignored for a Cat pet regardless (flat
   * base_price always). */
  use_pricing_matrix: boolean;
  /** Daycare-only: flat charge for the first hour (or less) of a session
   * on this service. NULL falls back to the documented ₱100 default. */
  first_hour_fee: number | null;
  /** Daycare-only: charge per additional billable hour (rounded up)
   * beyond the first, on this service. NULL falls back to ₱50. */
  succeeding_hour_fee: number | null;
  /** Daycare-only: charged per night when a pet on this service isn't
   * picked up before closing, on top of the hourly charge. NULL falls
   * back to ₱850. */
  daycare_overnight_fee: number | null;
  /** Whether booking this service requires a downpayment before the service
   * may start - broader than the branch-level Hotel downpayment percentage
   * (policy configuration), which this doesn't affect. Not category-gated. */
  requires_downpayment: boolean;
  /** A flat PHP amount, or a 0-100 percentage of this item's own price,
   * per downpayment_type. NULL unless requires_downpayment is true. */
  downpayment_amount: number | null;
  downpayment_type: 'Flat' | 'Percentage' | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  service_pricing_tiers?: ServicePricingTier[];
  service_branch_availability?: ServiceBranchAvailability[];
}

export interface Package {
  id: string;
  branch_id: string;
  name: string;
  bundled_price: number;
  /** Derived server-side from included services' duration_minutes - used to
   * estimate a package's contribution to a booking's total scheduled time
   * (multi-item bookings revision). */
  total_duration_minutes: number | null;
  /** Whether this package's booking-time price is derived from its
   * included services' own per-pet price (bundle-discounted) instead of
   * the flat bundled_price above. Ignored for a Cat pet regardless. */
  use_pricing_matrix: boolean;
  /** Same convention as Service's downpayment fields above. */
  requires_downpayment: boolean;
  downpayment_amount: number | null;
  downpayment_type: 'Flat' | 'Percentage' | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  package_services?: Array<{ service_id: string }>;
}

/** branches row subset the maintenance/booking pages need for labels/toggles.
 * is_vet_branch added for #55's Southwoods Veterinary-service filter (AC-3) -
 * additive, non-breaking for existing maintenance/discounts consumers. */
export interface BranchSummary {
  id: string;
  name: string;
  is_vet_branch: boolean;
}

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export interface OperatingHoursEntry {
  /** "HH:MM", branch-local wall-clock time. */
  open: string;
  close: string;
}

/** A day absent from this map means the branch is closed that day. */
export type OperatingHours = Partial<Record<Weekday, OperatingHoursEntry>>;

/** Full branch row - Superadmin System Configuration only (server/src/
 * features/branches). Distinct from BranchSummary, which every staff role
 * reads directly via Supabase RLS for branch-name dropdowns. */
export interface Branch {
  id: string;
  name: string;
  address: string;
  contact_number: string | null;
  is_vet_branch: boolean;
  operating_hours: OperatingHours;
  timezone: string;
  created_at: string;
}

export interface UpdateBranchPayload {
  name?: string;
  address?: string;
  contact_number?: string | null;
  is_vet_branch?: boolean;
  timezone?: string;
  operating_hours?: OperatingHours;
}

export interface CreateBranchPayload {
  name: string;
  address: string;
  contact_number?: string | null;
  is_vet_branch?: boolean;
  timezone: string;
  operating_hours?: OperatingHours;
}

/**
 * Epic B (#81): the Grooming size/coat matrix is derived server-side from
 * base_price + pricing_configuration - services no longer accept a
 * pricing_tiers field on create or update.
 */
export interface CreateServicePayload {
  name: string;
  category: ServiceCategory;
  /** Optional for Daycare - the server derives it from first_hour_fee.
   * Required for every other category. */
  base_price?: number;
  duration_minutes?: number;
  requires_assessed_pet?: boolean;
  min_nights_for_free_package?: number;
  free_package_name?: string;
  use_pricing_matrix?: boolean;
  first_hour_fee?: number;
  succeeding_hour_fee?: number;
  daycare_overnight_fee?: number;
  requires_downpayment?: boolean;
  downpayment_amount?: number;
  downpayment_type?: 'Flat' | 'Percentage';
}

export interface UpdateServicePayload {
  name?: string;
  category?: ServiceCategory;
  base_price?: number;
  duration_minutes?: number | null;
  is_active?: boolean;
  requires_assessed_pet?: boolean;
  min_nights_for_free_package?: number | null;
  free_package_name?: string | null;
  use_pricing_matrix?: boolean;
  first_hour_fee?: number | null;
  succeeding_hour_fee?: number | null;
  daycare_overnight_fee?: number | null;
  requires_downpayment?: boolean;
  downpayment_amount?: number | null;
  downpayment_type?: 'Flat' | 'Percentage' | null;
}

export interface BranchAvailabilityPayload {
  branch_id: string;
  is_available: boolean;
}

/** Epic B (#83): bundled_price is derived, not accepted as input. */
export interface CreatePackagePayload {
  branch_id: string;
  name: string;
  service_ids: string[];
  use_pricing_matrix?: boolean;
  requires_downpayment?: boolean;
  downpayment_amount?: number;
  downpayment_type?: 'Flat' | 'Percentage';
}

export interface UpdatePackagePayload {
  name?: string;
  is_active?: boolean;
  /** Full replacement of the included-services set when provided. */
  service_ids?: string[];
  use_pricing_matrix?: boolean;
  requires_downpayment?: boolean;
  downpayment_amount?: number | null;
  downpayment_type?: 'Flat' | 'Percentage' | null;
}

/**
 * Feature-local, mirrors server/src/features/maintenance/maintenance.types.ts
 * (discounts.types.ts declares its own copy independently - see that file).
 */
export type DiscountValueType = 'Percentage' | 'Flat';

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

/** One promo_scope row as the API accepts it - exactly one of the two ids. */
export interface PromoScopeInput {
  service_id?: string;
  package_id?: string;
}

export interface CreatePromoPayload {
  name: string;
  start_date?: string;
  end_date?: string;
  condition_note?: string;
  discount_type: DiscountValueType;
  value: number;
  scope_type: PromoScopeType;
  scope?: PromoScopeInput[];
  branch_scope: PromoBranchScope;
}

export interface UpdatePromoPayload {
  name?: string;
  start_date?: string | null;
  end_date?: string | null;
  condition_note?: string | null;
  discount_type?: DiscountValueType;
  value?: number;
  scope_type?: PromoScopeType;
  scope?: PromoScopeInput[];
  branch_scope?: PromoBranchScope;
  is_active?: boolean;
}

/** Same vocabulary as M02 pets.pet_type. */
export type PetType = 'Dog' | 'Cat';

export interface Breed {
  id: string;
  pet_type: PetType;
  name: string;
  created_at: string;
}

export interface CreateBreedPayload {
  pet_type: PetType;
  name: string;
}

export interface UpdateBreedPayload {
  pet_type?: PetType;
  name?: string;
}
