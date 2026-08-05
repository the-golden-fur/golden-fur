import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  CancellationLog,
  CancellationLogEventType,
  EnforcementMode,
} from '../booking.types.ts';

export interface WriteCancellationLogParams {
  bookingId: string;
  customerId: string;
  branchId: string;
  eventType: CancellationLogEventType;
  noticePeriodMet: boolean;
  enforcementModeApplied: EnforcementMode;
  policyViolation: boolean;
  rescheduleFeeCharged?: number | null;
}

/**
 * Issue #91: writes a cancellation_logs row for every cancellation/
 * reschedule event, regardless of outcome (AC-5) - called immediately after
 * evaluateNoticePeriod() resolves, from both cancellation.service.ts and
 * reschedule.service.ts. Always starts credit_issued: false/credit_amount:
 * null; cancellation.service.ts patches those two fields via
 * markCreditIssued() below only once #93's issueCredit() has actually
 * succeeded, so a row's credit fields never claim an issuance that didn't
 * happen.
 *
 * Best-effort: a logging failure must never surface as a 500 on top of an
 * already-committed booking mutation (the update this always follows has no
 * cheap way to roll back), so failures are swallowed and logged, mirroring
 * promoExpiry.job.ts's "never crash the caller" precedent. Returns null on
 * failure - callers must treat that as "no credit issuance follow-up is
 * possible for this event" rather than throwing themselves.
 */
export async function writeCancellationLog(
  params: WriteCancellationLogParams
): Promise<CancellationLog | null> {
  const { data, error } = await supabase
    .from('cancellation_logs')
    .insert({
      booking_id: params.bookingId,
      customer_id: params.customerId,
      branch_id: params.branchId,
      event_type: params.eventType,
      notice_period_met: params.noticePeriodMet,
      enforcement_mode_applied: params.enforcementModeApplied,
      policy_violation: params.policyViolation,
      credit_issued: false,
      credit_amount: null,
      reschedule_fee_charged: params.rescheduleFeeCharged ?? null,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.error(
      // eslint-disable-line no-console
      'writeCancellationLog failed:',
      error?.message ?? 'no row returned'
    );
    return null;
  }

  return data as CancellationLog;
}

/**
 * Patches a just-written log row once #93's creditIssuance.service.ts has
 * confirmed a real credit_transactions row was created - never sets these
 * fields optimistically ahead of that confirmation. Also best-effort: if
 * this patch fails, the credit itself was still issued correctly (the
 * ledger is the source of truth), only this log row's own summary fields
 * would understate it.
 */
export async function markCreditIssuedOnLog(
  logId: string,
  creditAmount: number
): Promise<void> {
  const { error } = await supabase
    .from('cancellation_logs')
    .update({ credit_issued: true, credit_amount: creditAmount })
    .eq('id', logId);

  if (error) {
    console.error(
      // eslint-disable-line no-console
      'markCreditIssuedOnLog failed:',
      error.message
    );
  }
}
