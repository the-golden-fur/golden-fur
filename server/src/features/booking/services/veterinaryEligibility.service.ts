import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  FINISHED_BOOKING_STATUSES,
  type ServiceCategory,
} from '../booking.types.ts';

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

interface VeterinarianTreatedCustomerParams {
  veterinarianId: string;
  customerId: string;
}

/**
 * Custom change (vet-bookings-queue-access): a Veterinarian now has real
 * access to the Bookings Queue / New Booking flow (replacing the old
 * ScheduleFollowUpModal, which could only ever target the one pet/customer
 * of the consultation it was opened from) - but still may only book a
 * customer they've actually treated, i.e. one they have a finished
 * consultation for (mirrors listVeterinarianPatients's own
 * FINISHED_BOOKING_STATUSES scoping). The client's Customer step already
 * filters to this same set (CustomerPicker's restrictToCustomerIds); this is
 * the actual enforcement boundary, same relationship as the branch guard
 * above.
 *
 * Any other staff role, and a customer booking for themselves, are
 * unaffected - only called when the requester's staff role is
 * 'Veterinarian' (see createBooking/createBookingGroup).
 */
export async function assertVeterinarianTreatedCustomer({
  veterinarianId,
  customerId,
}: VeterinarianTreatedCustomerParams): Promise<void> {
  const { data, error } = await supabase
    .from('consultations')
    .select('id, booking:bookings!booking_id!inner(customer_id, status)')
    .eq('veterinarian_id', veterinarianId)
    .eq('booking.customer_id', customerId)
    .in('booking.status', FINISHED_BOOKING_STATUSES)
    .limit(1);

  if (error) throwWithStatus(400, error.message);

  if (!data || data.length === 0) {
    throwWithStatus(403, 'You can only book a customer you have treated');
  }
}
