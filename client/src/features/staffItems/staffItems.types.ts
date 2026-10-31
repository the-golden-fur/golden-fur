/** Mirrors server/src/features/staffItems/staffItems.types.ts. */
export const STAFF_ITEM_ROLES = [
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
  'Front Desk',
  'Groomer',
  'Pet Assistant',
] as const;

export const STAFF_ITEM_ADMIN_ROLES = ['Admin', 'Superadmin'] as const;

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

export interface PickableStaffFoodItem extends StaffFoodItem {
  owner_display_name: string;
  is_mine: boolean;
}

export interface PickableStaffMedicationItem extends StaffMedicationItem {
  owner_display_name: string;
  is_mine: boolean;
}

export interface CreateStaffFoodItemPayload {
  name: string;
  quantity: string;
  quantity_unit?: FoodQuantityUnit;
  special_instructions?: string;
  photo_url?: string;
  is_public?: boolean;
}

export interface UpdateStaffFoodItemPayload {
  name?: string;
  quantity?: string;
  quantity_unit?: FoodQuantityUnit | null;
  special_instructions?: string | null;
  photo_url?: string | null;
  is_public?: boolean;
}

export interface CreateStaffMedicationItemPayload {
  name: string;
  dose: string;
  dose_unit?: MedicationDoseUnit;
  administration_notes?: string;
  photo_url?: string;
  is_public?: boolean;
}

export interface UpdateStaffMedicationItemPayload {
  name?: string;
  dose?: string;
  dose_unit?: MedicationDoseUnit | null;
  administration_notes?: string | null;
  photo_url?: string | null;
  is_public?: boolean;
}

/** Client-only union for the combined browsable library list (follow-up
 * #4) - food and medication stay two separate DB tables/API calls, merged
 * here just for one Notion-style browser. */
export type StaffCatalogItem =
  | (StaffFoodItem & { kind: 'food' })
  | (StaffMedicationItem & { kind: 'medication' });

export type PickableStaffCatalogItem =
  | (PickableStaffFoodItem & { kind: 'food' })
  | (PickableStaffMedicationItem & { kind: 'medication' });
