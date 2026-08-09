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
 */
export async function getCagePickerOptions(
  branchId: string,
  serviceCategory: ServiceCategory
): Promise<CagePickerOptionsResult> {
  const enabled = await isCagePickerEnabled(serviceCategory);

  if (!enabled) {
    return { cage_picker_enabled: false, options: [] };
  }

  const { data, error } = await supabase
    .from('cages')
    .select('id, cage_label, size, status')
    .eq('branch_id', branchId)
    .eq('status', 'Available')
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
 * preference is advisory-only and check-in re-validates/re-picks anyway. */
export async function verifyCagePreference(
  cageId: string,
  branchId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('cages')
    .select('id')
    .eq('id', cageId)
    .eq('branch_id', branchId)
    .eq('status', 'Available')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  return data ? cageId : null;
}
