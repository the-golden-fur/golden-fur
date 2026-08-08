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

export type ServiceCategory =
  | 'Grooming'
  | 'Hotel'
  | 'Daycare'
  | 'Veterinary'
  | 'Misc';

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

/** Custom change (configurable pricing rules): each size (and Long coat)
 * derives its own adjustment independently - a flat multiplier is no longer
 * the only option. `percentage` is always a percentage of the service's own
 * base_price, never of another rule's already-adjusted result. */
export type PricingRuleType = 'multiplier' | 'flat' | 'percentage';

/** Epic B (#80): the shared, singleton grooming size/coat calculation.
 * daycare_overnight_fee used to live here too (#22) but was moved to
 * services.daycare_overnight_fee (Custom change: Daycare fee
 * configuration) - a per-service fee, not a Grooming pricing rule. */
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
  /** Whether a pet with no recorded weight_class/coat_type (never staff-
   * assessed onsite) may book this service - false only for the seeded
   * "Initial Assessment" service. See ...073_m02_pets_assessment_lock.sql. */
  requires_assessed_pet: boolean;
  /** Hotel-only: booking this service for this many nights or more
   * auto-awards free_package_name as a zero-priced booking_items row. NULL
   * = no free-package condition. See ...105_m13_hotel_fixed_price_service.sql. */
  min_nights_for_free_package: number | null;
  /** Hotel-only: matched against packages.name at the booking's own
   * branch_id when min_nights_for_free_package is met - not a direct FK,
   * since packages are seeded one row per branch while this services row is
   * branch-independent. */
  free_package_name: string | null;
  /** Custom change (pricing matrix fix): whether this service's price
   * varies by the pet's weight_class/coat_type (Grooming only -
   * meaningless elsewhere). Off by default for new services - only
   * Bath/Blow-dry/Brushing are seeded on, matching the board's "individual
   * services don't vary by size/coat" pricing. Always ignored for a Cat
   * pet regardless of this flag - see resolveServicePrice in
   * booking.service.ts. */
  use_pricing_matrix: boolean;
  /** Daycare-only: flat charge for the first hour (or less) of a session on
   * this service. NULL falls back to the documented ₱100 default
   * (daycareBilling.service.ts). */
  first_hour_fee: number | null;
  /** Daycare-only: charge per additional billable hour (rounded up) beyond
   * the first, on this service. NULL falls back to the documented ₱50
   * default. */
  succeeding_hour_fee: number | null;
  /** Daycare-only: charged per night when a pet on this service isn't
   * picked up before closing, on top of the hourly charge. NULL falls back
   * to the documented ₱850 default. Moved here from a shared
   * policy_configurations column (Custom change: Daycare fee
   * configuration) - "each Daycare-type service can have its own overnight
   * fee." */
  daycare_overnight_fee: number | null;
  /** Custom change (P-1 roadmap item): whether booking this service requires
   * a downpayment before the service may start. Not category-gated, though
   * expected to be used mainly for Hotel services per the roadmap note
   * (the seeded Hotel service is itself flagged, replacing the old
   * branch-wide policy_configurations.downpayment_percentage, since
   * removed). See resolveBookingItem in booking.service.ts. */
  requires_downpayment: boolean;
  /** The downpayment figure - a flat PHP amount, or a 0-100 percentage of
   * this item's own price_at_booking, per downpayment_type. NULL unless
   * requires_downpayment is true. */
  downpayment_amount: number | null;
  /** How to interpret downpayment_amount. NULL unless requires_downpayment
   * is true. See resolveBookingItem in booking.service.ts. */
  downpayment_type: 'Flat' | 'Percentage' | null;
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
  /**
   * Multi-item bookings revision: derived on read from included services'
   * duration_minutes via derivePackageDuration, mirroring bundled_price's own
   * derivation - packages have no stored duration column either. Used to
   * estimate a package's contribution to a booking's total scheduled time
   * before submission (the server recomputes its own authoritative value at
   * booking-creation time in booking.service.ts).
   */
  total_duration_minutes: number | null;
  /** Custom change (pricing matrix fix): off by default (packages have
   * never varied by pet before). When on, the booking-time price is
   * derived as the sum of each included service's own per-pet price
   * (respecting each member's own use_pricing_matrix flag and the Cat
   * flat-price rule) with the bundle discount applied on top - see
   * resolvePackagePrice in booking.service.ts - instead of this row's own
   * flat bundled_price. bundled_price above still shows the flat estimate
   * either way (an S/SC-equivalent reference figure for the admin list). */
  use_pricing_matrix: boolean;
  /** Custom change (P-1 roadmap item): same convention as
   * Service.requires_downpayment/downpayment_amount/downpayment_type above. */
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
