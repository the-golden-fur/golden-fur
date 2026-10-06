import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  recomputeBookingGroupPaymentStatus,
  recomputeBookingPaymentStatus,
} from '../../booking/services/booking.service.ts';
import type {
  Consultation,
  ConsultationMedication,
} from '../veterinary.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One prescribed medicine as it reads on the bill. */
export interface PharmacyLine {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

/** What a save should do to a visit's medicine transaction, worked out
 * before anything is written (see planPharmacyCharge). */
export interface PharmacyChargePlan {
  /** The medicine transaction has already been paid (fully or partly) -
   * the bill stays exactly as it was collected. */
  locked: boolean;
  /** The still-Pending medicine transaction to rewrite or remove, if any. */
  existing: { id: string; total_amount: number } | null;
  /** What should be billed after this save. Empty when the customer is
   * buying from another pharmacy, or nothing is prescribed. */
  lines: PharmacyLine[];
}

interface PlanPharmacyChargeParams {
  consultation: Consultation;
  /** The prescription as it will be after this save. */
  medications: ConsultationMedication[];
  /** True = buying from this branch's pharmacy; false = buying elsewhere. */
  soldAtPharmacy: boolean;
}

async function priceLines(
  medications: ConsultationMedication[]
): Promise<PharmacyLine[]> {
  const unlisted = medications.find(
    (medication) => !medication.medication_catalog_id
  );
  if (unlisted) {
    throwWithStatus(
      400,
      `${unlisted.name} is not on the medicine list, so it has no price - add it from the medicine list to sell it`
    );
  }

  const { data, error } = await supabase
    .from('vet_medication_catalog')
    .select('id, default_price')
    .in(
      'id',
      medications.map((medication) => medication.medication_catalog_id)
    );

  if (error) throwWithStatus(400, error.message);

  const priceById = new Map(
    ((data ?? []) as Array<{ id: string; default_price: number | null }>).map(
      (row) => [row.id, row.default_price]
    )
  );

  return medications.map((medication) => {
    const price = priceById.get(medication.medication_catalog_id as string);

    if (price === null || price === undefined) {
      throwWithStatus(
        400,
        `${medication.name} has no price on the medicine list - set one before selling it`
      );
    }

    const quantity = medication.quantity ?? 1;
    const unitPrice = round2(Number(price));

    return {
      description: medication.name,
      quantity,
      unit_price: unitPrice,
      line_total: round2(unitPrice * quantity),
    };
  });
}

/**
 * Pharmacy prescriptions: decides what a save should do to the visit's
 * medicine transaction, and refuses (400) a sale that can't be priced. Kept
 * separate from applyPharmacyCharge so updateConsultation can run it BEFORE
 * completing the booking - a medicine with no price then stops the save
 * outright instead of leaving a completed visit with an error on screen.
 *
 * Prices always come from the shared medicine list (vet_medication_catalog
 * .default_price), never from the request.
 */
export async function planPharmacyCharge({
  consultation,
  medications,
  soldAtPharmacy,
}: PlanPharmacyChargeParams): Promise<PharmacyChargePlan> {
  let existing: PharmacyChargePlan['existing'] = null;

  if (consultation.medication_transaction_id) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, payment_status, total_amount')
      .eq('id', consultation.medication_transaction_id)
      .maybeSingle();

    if (error) throwWithStatus(400, error.message);

    const row = data as {
      id: string;
      payment_status: string;
      total_amount: number;
    } | null;

    if (row && row.payment_status !== 'Pending') {
      return { locked: true, existing: null, lines: [] };
    }

    if (row) {
      existing = { id: row.id, total_amount: Number(row.total_amount) };
    }
  }

  const lines =
    soldAtPharmacy && medications.length > 0
      ? await priceLines(medications)
      : [];

  return { locked: false, existing, lines };
}

interface ApplyPharmacyChargeParams {
  consultation: Consultation;
  plan: PharmacyChargePlan;
  /** The vet saving the prescription - recorded on a newly-created charge. */
  requesterId: string;
}

/** The booking fields a visit charge is posted against. */
export interface ChargeBooking {
  id: string;
  customer_id: string;
  branch_id: string;
  total_price: number;
  booking_group_id: string | null;
}

export async function loadChargeBooking(
  bookingId: string
): Promise<ChargeBooking> {
  const { data: bookingRow, error: bookingError } = await supabase
    .from('bookings')
    .select('id, customer_id, branch_id, total_price, booking_group_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError) throwWithStatus(400, bookingError.message);
  if (!bookingRow) throwWithStatus(404, 'Booking not found');

  return bookingRow as ChargeBooking;
}

/** transaction_line_items rows for a visit charge - `reference_id` is the
 * consultation the lines came from. */
function lineItemRows(
  transactionId: string,
  consultationId: string,
  lines: PharmacyLine[]
) {
  return lines.map((line) => ({
    transaction_id: transactionId,
    line_item_type: 'service',
    reference_id: consultationId,
    ...line,
  }));
}

interface InsertPendingChargeParams {
  booking: ChargeBooking;
  consultationId: string;
  lines: PharmacyLine[];
  /** The vet whose save produced the charge. */
  requesterId: string;
  /** What the charge is, for the error if it can't be created. */
  label: string;
}

/**
 * Posts a visit charge onto `transactions` as its own Pending 'balance'
 * booking_payment row with one line item per line - the same shape
 * postPayAtCheckoutCharge posts - so the cashier sees and settles it on the
 * Transactions page and the customer can pay it with credit, with no change
 * to either screen. Shared by the medicine sale below and the vet's
 * "services done" (serviceCharge.service.ts). Returns the new transaction's
 * id; the caller moves the booking total (moveBookingTotal).
 */
export async function insertPendingCharge({
  booking,
  consultationId,
  lines,
  requesterId,
  label,
}: InsertPendingChargeParams): Promise<string> {
  const groupId = booking.booking_group_id;
  const total = round2(lines.reduce((sum, line) => sum + line.line_total, 0));

  const { data: created, error: createError } = await supabase
    .from('transactions')
    .insert({
      // A grouped booking's transactions hang off the group, never the
      // booking (transactions_booking_id_matches_type).
      booking_id: groupId ? null : booking.id,
      booking_group_id: groupId,
      customer_id: booking.customer_id,
      branch_id: booking.branch_id,
      transaction_type: 'booking_payment',
      // Placeholder, overwritten when the money is collected - same as
      // postPayAtCheckoutCharge's own Pending rows.
      payment_method: 'Cash',
      payment_status: 'Pending',
      payment_choice: 'balance',
      subtotal_amount: total,
      total_amount: total,
      processed_by_staff_id: requesterId,
    })
    .select('id')
    .maybeSingle();

  if (createError || !created) {
    throwWithStatus(
      400,
      createError?.message ?? `Failed to create the ${label} charge`
    );
  }

  const transactionId = (created as { id: string }).id;

  const { error: linesError } = await supabase
    .from('transaction_line_items')
    .insert(lineItemRows(transactionId, consultationId, lines));
  if (linesError) throwWithStatus(400, linesError.message);

  return transactionId;
}

/**
 * Moves the booking's total_price (and a grouped booking's group net_total)
 * by `difference`, then re-rolls the payment status - so the rollup still
 * compares what was settled against what is actually owed once a visit
 * charge has been added, changed or removed.
 */
export async function moveBookingTotal(
  booking: ChargeBooking,
  difference: number
): Promise<void> {
  const groupId = booking.booking_group_id;
  const nowIso = new Date().toISOString();

  if (difference !== 0) {
    const { error: totalError } = await supabase
      .from('bookings')
      .update({
        total_price: round2(Number(booking.total_price) + difference),
        updated_at: nowIso,
      })
      .eq('id', booking.id);
    if (totalError) throwWithStatus(400, totalError.message);

    if (groupId) {
      const { data: groupRow, error: groupError } = await supabase
        .from('booking_groups')
        .select('net_total')
        .eq('id', groupId)
        .maybeSingle();
      if (groupError) throwWithStatus(400, groupError.message);
      if (!groupRow) throwWithStatus(404, 'Booking group not found');

      const { error: groupTotalError } = await supabase
        .from('booking_groups')
        .update({
          net_total: round2(
            Number((groupRow as { net_total: number }).net_total) + difference
          ),
          updated_at: nowIso,
        })
        .eq('id', groupId);
      if (groupTotalError) throwWithStatus(400, groupTotalError.message);
    }
  }

  // The charge itself is already saved; a failed status roll-up must not
  // undo it (same best-effort stance as postPayAtCheckoutCharge).
  try {
    if (groupId) {
      await recomputeBookingGroupPaymentStatus(groupId);
    } else {
      await recomputeBookingPaymentStatus(booking.id);
    }
  } catch (rollupError) {
    console.error(
      `moveBookingTotal: failed to roll up payment_status for booking ${booking.id}:`,
      rollupError
    );
  }
}

/**
 * Pharmacy prescriptions: puts a visit's medicine sale onto `transactions`
 * as its own Pending charge (insertPendingCharge). Idempotent: the plan says
 * whether to create, rewrite or remove that row, and a paid one is never
 * touched. The booking total follows by the same amount (moveBookingTotal).
 */
export async function applyPharmacyCharge({
  consultation,
  plan,
  requesterId,
}: ApplyPharmacyChargeParams): Promise<void> {
  if (plan.locked) return;
  if (!plan.existing && plan.lines.length === 0) return;

  const booking = await loadChargeBooking(consultation.booking_id);
  const nowIso = new Date().toISOString();
  const total = round2(
    plan.lines.reduce((sum, line) => sum + line.line_total, 0)
  );
  const previousTotal = plan.existing?.total_amount ?? 0;

  if (plan.existing && plan.lines.length === 0) {
    // Unlink first - consultations.medication_transaction_id references the
    // row about to be deleted.
    const { error: unlinkError } = await supabase
      .from('consultations')
      .update({ medication_transaction_id: null, updated_at: nowIso })
      .eq('id', consultation.id);
    if (unlinkError) throwWithStatus(400, unlinkError.message);

    const { error: linesError } = await supabase
      .from('transaction_line_items')
      .delete()
      .eq('transaction_id', plan.existing.id);
    if (linesError) throwWithStatus(400, linesError.message);

    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', plan.existing.id);
    if (deleteError) throwWithStatus(400, deleteError.message);
  } else if (plan.existing) {
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        subtotal_amount: total,
        total_amount: total,
        updated_at: nowIso,
      })
      .eq('id', plan.existing.id);
    if (updateError) throwWithStatus(400, updateError.message);

    const { error: clearError } = await supabase
      .from('transaction_line_items')
      .delete()
      .eq('transaction_id', plan.existing.id);
    if (clearError) throwWithStatus(400, clearError.message);

    const { error: linesError } = await supabase
      .from('transaction_line_items')
      .insert(lineItemRows(plan.existing.id, consultation.id, plan.lines));
    if (linesError) throwWithStatus(400, linesError.message);
  } else {
    const transactionId = await insertPendingCharge({
      booking,
      consultationId: consultation.id,
      lines: plan.lines,
      requesterId,
      label: 'medicine',
    });

    const { error: linkError } = await supabase
      .from('consultations')
      .update({ medication_transaction_id: transactionId, updated_at: nowIso })
      .eq('id', consultation.id);
    if (linkError) throwWithStatus(400, linkError.message);
  }

  await moveBookingTotal(booking, round2(total - previousTotal));
}
