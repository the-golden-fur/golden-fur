import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { ServiceCategory } from '../booking.types.ts';

interface VeterinaryEligibilityParams {
  branchId: string;
  serviceCategory: ServiceCategory;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Issue #53: server-side Makati-only Veterinary enforcement. This is the
 * actual enforcement boundary - #55's client-side branch filtering is a UX
 * convenience layered on top, never a replacement.
 *
 * Called at the very top of the creation flow (booking.service.ts) before any
 * capacity check, and by reschedule.service.ts when a reschedule changes
 * branch_id - so a Veterinary booking at a non-vet branch fails fast with a
 * distinct branch-eligibility error (422), not a confusing capacity error
 * (#53 AC-1).
 *
 * Scoped to Veterinary only: every other category at any branch passes
 * through untouched (#53 AC-2).
 */
export async function assertVeterinaryBranchEligibility({
  branchId,
  serviceCategory,
}: VeterinaryEligibilityParams): Promise<void> {
  if (serviceCategory !== 'Veterinary') {
    return;
  }

  const { data: branch, error } = await supabase
    .from('branches')
    .select('id, name, is_vet_branch')
    .eq('id', branchId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!branch) throwWithStatus(404, 'Branch not found');

  if (!branch.is_vet_branch) {
    throwWithStatus(
      422,
      `Veterinary services are not offered at the ${branch.name} branch — ` +
        'Veterinary bookings are exclusive to the Makati branch'
    );
  }
}
