import { supabase } from '../../../config/supabase/supabase.config.ts';
import { TRENDS_READ_ROLES, type TrendsReport } from '../reports.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const REPORT_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const EMPTY_TRENDS: TrendsReport = {
  bookings_total: 0,
  bookings_by_category: {},
  bookings_by_pet_type: {},
  registered_pets_by_type: {},
  new_pets_by_type: {},
  packages_booked: [],
  top_grooming_services: [],
  staff_bookings: [],
  deleted_pet_reasons: {},
  deleted_pet_other_notes: [],
};

interface GetTrendsParams {
  requesterRole: string;
  requesterBranchId: string;
  branchId?: string | null;
  /** YYYY-MM-DD, Manila day */
  dateFrom: string;
  /** YYYY-MM-DD, Manila day, inclusive */
  dateTo: string;
}

/**
 * Custom change (Trends page): what's popular over a date range - pet
 * types, services, packages, groomer/vet load and why pets were deleted -
 * from get_trends() (20261021276).
 *
 * Branch-scoping mirrors getBookingActivityReport: only a Superadmin may
 * pass a branchId or leave it out for every branch together; Admin/
 * Supervisor are locked to their own branch regardless of what they pass.
 * The role is re-checked here on top of the route's requireRole.
 */
export async function getTrends({
  requesterRole,
  requesterBranchId,
  branchId,
  dateFrom,
  dateTo,
}: GetTrendsParams): Promise<TrendsReport> {
  if (!TRENDS_READ_ROLES.includes(requesterRole)) {
    throwWithStatus(403, 'You do not have access to Trends');
  }

  if (!REPORT_DAY.test(dateFrom) || !REPORT_DAY.test(dateTo)) {
    throwWithStatus(400, 'date_from and date_to must be YYYY-MM-DD');
  }

  // Same-format strings compare in date order.
  if (dateFrom > dateTo) {
    throwWithStatus(400, 'date_from must be on or before date_to');
  }

  const effectiveBranchId =
    requesterRole === 'Superadmin' ? (branchId ?? null) : requesterBranchId;

  const { data, error } = await supabase.rpc('get_trends', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_branch_id: effectiveBranchId,
  });

  if (error) throwWithStatus(400, error.message);

  return { ...EMPTY_TRENDS, ...((data ?? {}) as Partial<TrendsReport>) };
}
