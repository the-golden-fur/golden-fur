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
  | 'Assessment';

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
  /** Custom change (payments-queue pet assessment capture): whether
   * starting a booking on this service opens a modal to record/update the
   * pet's weight_class/coat_type before advancing status - distinct from
   * requires_assessed_pet above (which gates booking access, not the Start
   * action). Seeded true only for "Initial Assessment"/"Reassessment". See
   * PaymentsQueuePage.tsx. */
  captures_pet_assessment: boolean;
  /** Hotel-only: booking this service for this many nights or more
   * auto-awards free_package_name as a zero-priced booking_items row. NULL
   * = no free-package condition. See ...105_m13_hotel_fixed_price_service.sql. */
  min_nights_for_free_package: number | null;
  /** Hotel-only: matched against packages.name (filtered to packages
   * available at the booking's own branch via package_branch_availability)
   * when min_nights_for_free_package is met - not a direct FK. */
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

/** Custom change: mirrors ServiceBranchAvailability/
 * ServiceTypeBranchAvailability - replaces the old MA22 "one branch_id per
 * package row" model with a many-to-many join, same as services and service
 * types. */
export interface PackageBranchAvailability {
  package_id: string;
  branch_id: string;
  is_available: boolean;
}

export interface Package {
  id: string;
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
  /** Custom change (pricing matrix redesign): off by default (packages have
   * never varied by pet before). When on, the booking-time price runs this
   * row's own flat bundled_price through the same weight/coat rule engine a
   * standalone Grooming service's base_price uses (deriveGroomingMatrix),
   * independent of any included service's own use_pricing_matrix flag - see
   * resolvePackagePrice in booking.service.ts. Also exempt for a Cat pet,
   * same as a service's own matrix. bundled_price above still shows the
   * flat estimate either way (an S/SC-equivalent reference figure for the
   * admin list). */
  use_pricing_matrix: boolean;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  package_services?: Array<{ service_id: string }>;
  package_branch_availability?: PackageBranchAvailability[];
}

/** Same vocabulary as M02 pets.pet_type. */
export type PetType = 'Dog' | 'Cat';

export interface Breed {
  id: string;
  pet_type: PetType;
  name: string;
  created_at: string;
}

/**
 * Custom change: admin-editable metadata for the customer-selectable
 * service lines (Grooming/Hotel/Daycare/Veterinary) - `key` matches the
 * hardcoded ServiceCategory value each row represents; renaming `name` only
 * changes the customer-facing label. staff_picker_enabled/
 * cage_picker_enabled gate whether those steps are offered in the booking
 * flow for this type - see staffPicker.service.ts/cagePicker.service.ts.
 */
/** Custom change: mirrors ServiceBranchAvailability - replaces the
 * row-level Activate/Deactivate action on the admin Service Types page. */
export interface ServiceTypeBranchAvailability {
  service_type_id: string;
  branch_id: string;
  is_available: boolean;
}

export interface ServiceType {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
  staff_picker_enabled: boolean;
  cage_picker_enabled: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  service_type_branch_availability?: ServiceTypeBranchAvailability[];
}

export type PromoScopeType = 'all_services' | 'specific';

export interface PromoScopeItem {
  id: string;
  promo_id: string;
  service_id: string | null;
  package_id: string | null;
}

/** Custom change: mirrors ServiceBranchAvailability/PackageBranchAvailability
 * - replaces the promo's original branch_scope enum
 * ('makati'/'southwoods'/'both'). */
export interface PromoBranchAvailability {
  promo_id: string;
  branch_id: string;
  is_available: boolean;
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
  /**
   * Deliberately NOT derived from promo_branch_availability - unlike
   * Discount/Service/Package/ServiceType, is_active also drives automatic
   * date-based expiry (promoExpiry.job.ts), a temporal concern independent
   * of which branches carry the promo. Still a manually-settable flag via
   * updatePromo.
   */
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  promo_scope?: PromoScopeItem[];
  promo_branch_availability?: PromoBranchAvailability[];
}
