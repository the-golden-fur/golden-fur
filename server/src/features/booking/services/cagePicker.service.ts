import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CagePickerOption, ServiceCategory } from '../booking.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface CageRow {
  id: string;
  cage_label: string;
  size: string;
  status: string;
}

function throwIfPetNotFound<T>(pet: T | null): T {
  if (!pet) throwWithStatus(404, 'Pet not found');
  return pet;
}

/**
 * Custom change: Cage Picker addendum, mirroring staffPicker.service.ts's
 * isStaffPickerEnabled - single resolution point for whether the Cage
 * Picker step should render for this branch + service type. Reads the
 * type-level toggle from service_types (no per-branch override, unlike the
 * Staff Picker's policy_configurations - this is new, simpler config, not a
 * migration of existing behavior).
 */
export async function isCagePickerEnabled(
  serviceCategory: ServiceCategory
): Promise<boolean> {
  if (serviceCategory !== 'Hotel') {
    return false;
  }

  const { data, error } = await supabase
    .from('service_types')
    .select('cage_picker_enabled')
    .eq('key', serviceCategory)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  return data?.cage_picker_enabled ?? false;
}

export interface CagePickerOptionsResult {
  cage_picker_enabled: boolean;
  options: CagePickerOption[];
}

/**
 * Cage Picker endpoint payload - same shape/semantics as
 * getStaffPickerOptions: disabled means no cage list at all (behaves as
 * though "No preference" were selected), "No preference" is always present
 * and always first when enabled. Cage availability is a live status
 * snapshot ('Available' cages at the branch right now), not a time-window
 * query - the actual claim still only happens at check-in via
 * cageAssignment.service.ts's suggestCage/assignCage.
 *
 * Custom change (cage pet-type support): petId is now required so the
 * options list can be hard-filtered to cages whose cage_pet_types include
 * this pet's own pet_type - unlike cage size (soft, staff-overridable), a
 * wrong-pet-type cage is excluded from the list entirely, for every caller
 * (customer and staff alike).
 */
export async function getCagePickerOptions(
  branchId: string,
  serviceCategory: ServiceCategory,
  petId: string
): Promise<CagePickerOptionsResult> {
  const enabled = await isCagePickerEnabled(serviceCategory);

  if (!enabled) {
    return { cage_picker_enabled: false, options: [] };
  }

  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('pet_type')
    .eq('id', petId)
    .maybeSingle();

  if (petError) throwWithStatus(400, petError.message);
  const petType = throwIfPetNotFound(pet).pet_type as string;

  const { data, error } = await supabase
    .from('cages')
    .select('id, cage_label, size, status, cage_pet_types!inner(pet_type)')
    .eq('branch_id', branchId)
    .eq('status', 'Available')
    .eq('cage_pet_types.pet_type', petType)
    .order('size')
    .order('cage_label');

  if (error) throwWithStatus(400, error.message);

  const cages = (data ?? []) as CageRow[];

  return {
    cage_picker_enabled: true,
    options: [
      { type: 'no_preference' },
      ...cages.map((cage) => ({
        type: 'specific' as const,
        cage_id: cage.id,
        cage_label: cage.cage_label,
        size: cage.size,
      })),
    ],
  };
}

/** Re-verifies a specific cage preference is still 'Available' at booking
 * confirmation time (mirrors resolveStaffAssignment's re-verification of a
 * specific staff preference) - returns null (silently degrades to "no
 * preference") rather than rejecting the whole booking, since a cage
 * preference is advisory-only and check-in re-validates/re-picks anyway.
 *
 * petType (Custom change: cage pet-type support) - always applied,
 * unconditionally, for every caller (customer and staff): a pet-type
 * mismatch is a hard filter, unlike requiredSize below.
 *
 * requiredSize (Custom change: cage size booking restriction) - when given
 * (a customer's own booking, never a staff-created one), the cage must also
 * match the pet's own weight_class or this degrades to null exactly like an
 * unavailable cage does, so a customer can't book a mismatched-size cage by
 * calling the API directly, bypassing CagePickerList's disabled tiles.
 * Receptionist/staff bookings pass no requiredSize and keep free choice. */
export async function verifyCagePreference(
  cageId: string,
  branchId: string,
  petType: string,
  requiredSize?: string
): Promise<string | null> {
  let query = supabase
    .from('cages')
    .select('id, cage_pet_types!inner(pet_type)')
    .eq('id', cageId)
    .eq('branch_id', branchId)
    .eq('status', 'Available')
    .eq('cage_pet_types.pet_type', petType);

  if (requiredSize) {
    query = query.eq('size', requiredSize);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throwWithStatus(400, error.message);

  return data ? cageId : null;
}

/**
 * Custom change (cage pet-type support / customer readonly cage view):
 * answers the customer-facing "is there a cage for my pet" question -
 * matches the pet's weight_class + pet_type against Available cages at the
 * branch, mirroring cageAssignment.service.ts's suggestCage matching logic,
 * but returns only a boolean + minimal cage identity (never the full list -
 * the customer only needs to know whether one exists, optionally its
 * label). Deliberately not gated on a selected date/time slot, since cage
 * availability is a live status snapshot, not a per-slot check - callers
 * can (and should) show this as soon as the pet is known.
 */
export async function getCageAssignmentStatus(
  petId: string,
  branchId: string
): Promise<{
  matched: boolean;
  cage: { id: string; cage_label: string } | null;
}> {
  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('weight_class, pet_type')
    .eq('id', petId)
    .maybeSingle();

  if (petError) throwWithStatus(400, petError.message);
  const { weight_class, pet_type } = throwIfPetNotFound(pet);

  const { data, error } = await supabase
    .from('cages')
    .select('id, cage_label, cage_pet_types!inner(pet_type)')
    .eq('branch_id', branchId)
    .eq('size', weight_class as string)
    .eq('status', 'Available')
    .eq('cage_pet_types.pet_type', pet_type as string)
    .limit(1)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  return {
    matched: !!data,
    cage: data ? { id: data.id, cage_label: data.cage_label } : null,
  };
}
