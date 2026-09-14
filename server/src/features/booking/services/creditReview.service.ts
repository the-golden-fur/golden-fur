import { supabase } from '../../../config/supabase/supabase.config.ts';
import { round2 } from './booking.service.ts';
import { resolveEffectivePolicy } from './staffPicker.service.ts';
import { confirmedAmountPaid } from './cancellation.service.ts';
import { issueCredit } from '../../credits/services/creditIssuance.service.ts';
import { manilaEndOfDayIso } from '../../credits/modules/creditExpiry.util.ts';
import type { Booking, CancellationLog } from '../booking.types.ts';
import type { DecideCreditReviewInput } from '../modules/validators/booking.validator.ts';

/** Mirrors cancellation.service.ts's own copy exactly (a private module
 * constant there) - duplicated rather than imported to keep this file's
 * dependency on that module limited to its exported surface
 * (confirmedAmountPaid). */
const DAY_MS = 24 * 60 * 60 * 1000;

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface CreditReviewQueueItem {
  log: CancellationLog;
  booking: Booking;
  /** Confirmed settled amount for this booking (same read
   * cancellation.service.ts uses) - shown so a reviewer isn't approving/
   * denying blind. */
  amount_paid: number;
  /** What approving right now would credit, at the branch's CURRENT
   * cancellation_credit_conversion_rate - a preview only; the real amount is
   * recomputed fresh at decision time (the rate may change between listing
   * and review). */
  potential_credit_amount: number;
}

/**
 * Manual-cancellation-credit-review custom change: every cancellation_logs
 * row a Manual-mode branch queued for review (credit_review_status =
 * 'pending'), oldest first - mirrors listPendingUnavailabilityRequests'
 * "oldest first" queue convention. Optionally scoped to one branch (a
 * Superadmin viewing "all" omits it, matching every other branch-scoped
 * staff queue in this codebase).
 */
export async function listPendingCreditReviews(
  branchId?: string
): Promise<CreditReviewQueueItem[]> {
  let query = supabase
    .from('cancellation_logs')
    .select('*, booking:bookings!booking_id(*)')
    .eq('credit_review_status', 'pending')
    .order('created_at', { ascending: true });

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as Array<CancellationLog & { booking: Booking }>;

  return Promise.all(
    rows.map(async (row) => {
      const { booking, ...log } = row;
      const amountPaid = await confirmedAmountPaid(log.booking_id);
      const policy = await resolveEffectivePolicy(log.branch_id);
      const potentialCreditAmount = round2(
        amountPaid * (policy.cancellation_credit_conversion_rate / 100)
      );

      return {
        log: log as CancellationLog,
        booking,
        amount_paid: amountPaid,
        potential_credit_amount: potentialCreditAmount,
      };
    })
  );
}

interface DecideCreditReviewParams {
  requesterId: string;
  cancellationLogId: string;
  decision: DecideCreditReviewInput['decision'];
}

/**
 * A staff member's approve/deny decision on a pending cancellation_logs row.
 * Approving calls the exact same issue_credit() path cancellation.service.ts
 * uses for the Automatic case, with the rate/expiry policy resolved FRESH at
 * decision time (not whatever it was when the cancellation happened) - same
 * "current policy governs" precedent updatePolicyConfiguration's own
 * retroactive credit-expiry re-apply already follows. issueCredit is called
 * (and must succeed) BEFORE the log row is ever touched, so a failure never
 * leaves the row half-decided - it just stays 'pending' for a retry.
 */
export async function decideCreditReview({
  requesterId,
  cancellationLogId,
  decision,
}: DecideCreditReviewParams): Promise<CancellationLog> {
  const { data: logRow, error } = await supabase
    .from('cancellation_logs')
    .select('*')
    .eq('id', cancellationLogId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!logRow) throwWithStatus(404, 'Cancellation log not found');

  const log = logRow as CancellationLog;

  if (log.credit_review_status !== 'pending') {
    throwWithStatus(
      409,
      `This cancellation has already been ${log.credit_review_status}`
    );
  }

  const nowIso = new Date().toISOString();

  if (decision === 'denied') {
    const { data: updated, error: updateError } = await supabase
      .from('cancellation_logs')
      .update({
        credit_review_status: 'denied',
        reviewed_by: requesterId,
        reviewed_at: nowIso,
      })
      .eq('id', cancellationLogId)
      .select('*')
      .maybeSingle();

    if (updateError || !updated) {
      throwWithStatus(
        400,
        updateError?.message ?? 'Failed to record the denial'
      );
    }

    return updated as CancellationLog;
  }

  const amountPaid = await confirmedAmountPaid(log.booking_id);
  const policy = await resolveEffectivePolicy(log.branch_id);
  const creditAmount = round2(
    amountPaid * (policy.cancellation_credit_conversion_rate / 100)
  );

  let issuedAmount: number | null = null;

  if (creditAmount > 0) {
    let expiresAt: string | null = null;
    if (policy.credit_expiry_mode === 'rolling') {
      expiresAt = manilaEndOfDayIso(
        new Date(Date.now() + policy.credit_expiry_days * DAY_MS)
      );
    } else if (
      policy.credit_expiry_mode === 'fixed_date' &&
      policy.credit_expiry_fixed_date
    ) {
      expiresAt = manilaEndOfDayIso(policy.credit_expiry_fixed_date);
    }

    const transaction = await issueCredit({
      customerId: log.customer_id,
      branchId: log.branch_id,
      amount: creditAmount,
      cancellationLogId: log.id,
      expiresAt,
    });

    if (!transaction) {
      throwWithStatus(502, 'Could not issue the credit - please try again');
    }

    issuedAmount = creditAmount;
  }
  // creditAmount <= 0 (e.g. the branch's rate dropped to 0% since
  // cancellation, or nothing was actually paid) - still a valid "approved"
  // decision, just with nothing to credit.

  const { data: updated, error: updateError } = await supabase
    .from('cancellation_logs')
    .update({
      credit_review_status: 'approved',
      ...(issuedAmount !== null
        ? { credit_issued: true, credit_amount: issuedAmount }
        : {}),
      reviewed_by: requesterId,
      reviewed_at: nowIso,
    })
    .eq('id', cancellationLogId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) {
    throwWithStatus(
      400,
      updateError?.message ?? 'Failed to record the approval'
    );
  }

  return updated as CancellationLog;
}
