/**
 * Shared staff-owned food/medication item library: every staff member who
 * can check in or book a Hotel/Daycare stay keeps their own reusable
 * food/medication items, and may mark any of them public so other staff can
 * pick them too (seeing the item's details and owner). Feature-local role
 * list (mirrors hotel.types.ts/daycare.types.ts's own copies) - exact
 * membership of HOTEL_ADVANCE_ROLES/DAYCARE_ADVANCE_ROLES, not reused from
 * catalog.types.ts's CATALOG_READ_ROLES (which also grants Veterinarian/
 * Cashier - unrelated to Hotel/Daycare care instructions).
 */
export const STAFF_ITEM_ROLES: readonly string[] = [
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
  'Front Desk',
  'Groomer',
  'Pet Assistant',
];

/** May edit or archive any *public* item, not just their own (never
 * someone else's private item). Mirrors hotel.types.ts's HOTEL_ADMIN_ROLES. */
export const STAFF_ITEM_ADMIN_ROLES: readonly string[] = [
  'Admin',
  'Superadmin',
];

// Duplicated from hotel.types.ts per this repo's per-feature-copy
// convention (see FOOD_QUANTITY_UNITS/MEDICATION_DOSE_UNITS there, already
// duplicated a second time in booking.validator.ts).
export const FOOD_QUANTITY_UNITS = [
  'cup',
  'gram',
  'ounce',
  'can',
  'scoop',
  'tablespoon',
  'teaspoon',
  'milliliter',
  'piece',
] as const;
export type FoodQuantityUnit = (typeof FOOD_QUANTITY_UNITS)[number];

export const MEDICATION_DOSE_UNITS = [
  'mg',
  'ml',
  'tablet',
  'capsule',
  'drop',
  'application',
] as const;
export type MedicationDoseUnit = (typeof MEDICATION_DOSE_UNITS)[number];

export interface StaffFoodItem {
  id: string;
  owner_staff_id: string;
  name: string;
  quantity: string;
  quantity_unit: FoodQuantityUnit | null;
  special_instructions: string | null;
  photo_url: string | null;
  is_public: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffMedicationItem {
  id: string;
  owner_staff_id: string;
  name: string;
  dose: string;
  dose_unit: MedicationDoseUnit | null;
  administration_notes: string | null;
  photo_url: string | null;
  is_public: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** listPickable's shape: the caller's own items (any visibility) plus
 * everyone else's public ones, each labeled with whose it is. */
export interface PickableStaffFoodItem extends StaffFoodItem {
  owner_display_name: string;
  is_mine: boolean;
}

export interface PickableStaffMedicationItem extends StaffMedicationItem {
  owner_display_name: string;
  is_mine: boolean;
}
