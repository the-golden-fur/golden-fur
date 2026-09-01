import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  getBookingForBilling,
  getServiceLineItems,
  type BookingForBilling,
} from './lineItemSources.service.ts';
import {
  evaluateDiscounts,
  evaluatePromos,
  type DiscountEligibility,
  type EvaluatedPromo,
} from './discountPromoEvaluation.service.ts';
import { applyCredit, getAvailableCredit } from './creditStub.service.ts';
import { resolvePaymentConfirmation } from './paymentMethod.service.ts';
import { initiatePaymongoPayment } from './paymongo.service.ts';
import { recomputeBookingPaymentStatus } from '../../booking/services/booking.service.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { sendPaymentConfirmedEmail } from '../../../shared/email/paymentConfirmedEmail.ts';
import type { CheckoutInput } from '../modules/validators/billing.validator.ts';
import type {
  DraftLineItem,
  Transaction,
  TransactionLineItem,
} from '../billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface CheckoutPreview {
  booking: BookingForBilling;
  serviceLines: DraftLineItem[];
  discountLines: DraftLineItem[];
  promoLines: DraftLineItem[];
  evaluatedPromos: EvaluatedPromo[];
  subtotal: number;
  discountAmount: number;
  promoAmount: number;
  /** Total before credit is applied - what the cashier checkout screen (#86
   * AC-1) shows as the "running total" alongside every line item. */
  preCreditTotal: number;
}

/**
 * Issue #84/#86: the read-only half of checkout - aggregates line items and
 * evaluates discounts/promos without creating anything, so the cashier
 * checkout screen can render a real preview (AC-1) before the cashier picks
 * a payment method and confirms. checkoutBooking() below calls this, then
 * adds credit/payment/persistence on top - no logic is duplicated between
 * the preview and the real checkout.
 *
 * Bucket note: discount_amount is documented as "sum of M12 discount line
 * items" (DB Design sheet), but a Hotel booking's already-collected
 * downpayment is also modeled as a line_item_type = 'discount' row (the
 * closest of the six documented line_item_type values to "a negative
 * reduction shown like a discount") - there is no dedicated
 * 'downpayment_credit' type. discountAmount below is therefore "every
 * discount-typed line's contribution, M12 or otherwise" - the actually
 * DB-enforced invariant (AC-4: SUM(line_total) = total_amount) holds
 * regardless of which bucket a given line's amount rolls into.
 */
export async function buildCheckoutPreview(
  bookingId: string,
  eligibility: DiscountEligibility
): Promise<CheckoutPreview> {
  const booking = await getBookingForBilling(bookingId);

  const serviceLines = await getServiceLineItems(booking);
  const subtotal = round2(
    serviceLines
      .filter(
        (line) =>
          line.line_item_type === 'service' || line.line_item_type === 'addon'
      )
      .reduce((sum, line) => sum + line.line_total, 0)
  );

  // Multi-item bookings / booking-time discount+promo revision: a booking
  // created via the wizard's payment step may already have a discount and/or
  // promo locked in (staff-verified ID, Cash-only for the discount - see
  // resolveDiscountAndPromo in booking.service.ts). When that's the case,
  // render the stored snapshot as-is instead of re-scanning discounts/promos
  // for a scope match here - two independent evaluations of the same rules
  // could disagree, which would be confusing at the register. Bookings with
  // nothing pre-selected (created before this feature, via a direct API
  // call, or a Veterinary follow-up copy) fall back to the original
  // auto-evaluate-by-scope behavior unchanged.
  const discountLines: DraftLineItem[] = booking.selected_discount_id
    ? [
        {
          line_item_type: 'discount',
          reference_id: booking.selected_discount_id,
          description: booking.selected_discount_name ?? 'Discount',
          quantity: 1,
          unit_price: -booking.discount_amount,
          line_total: -booking.discount_amount,
        },
      ]
    : await evaluateDiscounts(booking, eligibility, subtotal);

  const evaluatedPromos: EvaluatedPromo[] = booking.selected_promo_id
    ? [
        {
          promoId: booking.selected_promo_id,
          line: {
            line_item_type: 'promo',
            reference_id: booking.selected_promo_id,
            description: booking.selected_promo_name ?? 'Promo',
            quantity: 1,
            unit_price: -booking.promo_amount,
            line_total: -booking.promo_amount,
          },
        },
      ]
    : await evaluatePromos(booking, subtotal);
  const promoLines = evaluatedPromos.map((evaluated) => evaluated.line);

  const nonServiceDiscountLines = serviceLines.filter(
    (line) => line.line_item_type === 'discount'
  );
  const discountAmount = round2(
    [...nonServiceDiscountLines, ...discountLines].reduce(
      (sum, line) => sum - line.line_total,
      0
    )
  );
  const promoAmount = round2(
    promoLines.reduce((sum, line) => sum - line.line_total, 0)
  );

  const preCreditTotal = round2(
    [...serviceLines, ...discountLines, ...promoLines].reduce(
      (sum, line) => sum + line.line_total,
      0
    )
  );

  return {
    booking,
    serviceLines,
    discountLines,
    promoLines,
    evaluatedPromos,
    subtotal,
    discountAmount,
    promoAmount,
    preCreditTotal,
  };
}

export interface CheckoutResult {
  transaction: Transaction;
  lineItems: TransactionLineItem[];
  changeAmount: number | null;
  /** Set only for GCash/Maya's 'portal' channel - the customer completes
   * payment at this PayMongo-hosted URL; webhookConfirmation.service.ts
   * flips payment_status to Fully Paid once PayMongo calls back. */
  paymongoCheckoutUrl: string | null;
}

/**
 * Issue #84: builds the same preview above, then applies Epic B credit
 * (behind creditStub.service.ts until #90 ships), resolves the payment
 * method, and persists everything as one transactions row + its
 * transaction_line_items - total_amount is always computed server-side from
 * SUM(line_total), never trusted from the client (AC-1 through AC-4).
 */
export async function checkoutBooking(
  requesterId: string,
  input: CheckoutInput
): Promise<CheckoutResult> {
  // Payment/transactions rework: every non-Vet booking now carries a
  // still-'Pending' booking_payment charge from createInitialBookingCharge
  // (the booking-time estimate). Checkout recomputes the real total from line
  // items, so it *supersedes* that estimate - the Pending rows (and their
  // line items) are deleted here and checkout builds its own transaction. A
  // row that was actually settled (a cashier record-payment, a confirmed
  // webhook, an earlier checkout) is a real payment - keep the 409.
  const { data: existingTransactions, error: existingError } = await supabase
    .from('transactions')
    .select('id, payment_status')
    .eq('booking_id', input.booking_id);

  if (existingError) throwWithStatus(400, existingError.message);

  const settledRows = (existingTransactions ?? []).filter(
    (t) => t.payment_status !== 'Pending'
  );
  if (settledRows.length > 0) {
    throwWithStatus(
      409,
      `This booking already has a payment record (${settledRows[0].payment_status})`
    );
  }

  const staleChargeIds = (existingTransactions ?? []).map((t) => t.id);
  if (staleChargeIds.length > 0) {
    await supabase
      .from('transaction_line_items')
      .delete()
      .in('transaction_id', staleChargeIds);
    await supabase.from('transactions').delete().in('id', staleChargeIds);
  }

  const {
    booking,
    serviceLines,
    discountLines,
    promoLines,
    evaluatedPromos,
    subtotal,
    discountAmount,
    promoAmount,
    preCreditTotal,
  } = await buildCheckoutPreview(input.booking_id, {
    seniorCitizenEligible: input.senior_citizen_eligible,
    pwdEligible: input.pwd_eligible,
  });

  const availableCredit = await getAvailableCredit(
    booking.customer_id,
    booking.branch_id
  );
  const requestedCredit = Math.max(
    0,
    Math.min(input.credit_to_apply, availableCredit, preCreditTotal)
  );
  const creditResult = await applyCredit(
    booking.customer_id,
    booking.branch_id,
    requestedCredit
  );
  const creditAppliedAmount = creditResult.appliedAmount;

  const amountDue = round2(preCreditTotal - creditAppliedAmount);

  const { paymentStatus, changeAmount } = resolvePaymentConfirmation({
    paymentMethod: input.payment_method,
    onlineChannel: input.online_channel,
    amountDue,
    cashTendered: input.cash_tendered,
  });

  let paymentReference = input.payment_reference ?? null;
  let paymongoCheckoutUrl: string | null = null;

  if (paymentStatus === 'Pending') {
    const initiated = await initiatePaymongoPayment({
      paymentMethod: input.payment_method as 'GCash' | 'Maya',
      amount: amountDue,
      description: `Booking payment - ${booking.id}`,
      redirectSuccessUrl: process.env.PAYMONGO_REDIRECT_SUCCESS_URL ?? '',
      redirectFailedUrl: process.env.PAYMONGO_REDIRECT_FAILED_URL ?? '',
    });
    // The PayMongo Source id is what the webhook later looks the
    // transaction back up by (webhookConfirmation.service.ts) - stored in
    // payment_reference rather than a dedicated column, same "one column,
    // interpreted differently per method" convention Issue #83 already
    // established for Card/Bank Transfer/Grabmart/Pickaroo.
    paymentReference = initiated.sourceId;
    paymongoCheckoutUrl = initiated.checkoutUrl;
  }

  const allLines: DraftLineItem[] = [
    ...serviceLines,
    ...discountLines,
    ...promoLines,
  ];

  if (creditAppliedAmount > 0) {
    allLines.push({
      line_item_type: 'discount',
      reference_id: null,
      description: 'Credit applied',
      quantity: 1,
      unit_price: -creditAppliedAmount,
      line_total: -creditAppliedAmount,
    });
  }

  const totalAmount = round2(
    allLines.reduce((sum, line) => sum + line.line_total, 0)
  );

  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .insert({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      branch_id: booking.branch_id,
      transaction_type: 'booking_payment',
      payment_method: input.payment_method,
      bank_name: input.bank_name ?? null,
      payment_status: paymentStatus,
      subtotal_amount: subtotal,
      discount_amount: discountAmount,
      promo_amount: promoAmount,
      credit_applied_amount: creditAppliedAmount,
      total_amount: totalAmount,
      payment_reference: paymentReference,
      processed_by_staff_id: paymentStatus === 'Pending' ? null : requesterId,
    })
    .select('*')
    .maybeSingle();

  if (transactionError || !transaction) {
    throwWithStatus(
      400,
      transactionError?.message ?? 'Failed to create transaction'
    );
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from('transaction_line_items')
    .insert(
      allLines.map((line) => ({ ...line, transaction_id: transaction.id }))
    )
    .select('*');

  if (lineItemsError) throwWithStatus(400, lineItemsError.message);

  if (evaluatedPromos.length > 0) {
    const now = new Date().toISOString();
    await supabase.from('transaction_promo_selections').insert(
      evaluatedPromos.map((evaluated) => ({
        transaction_id: transaction.id,
        promo_id: evaluated.promoId,
        is_activated: true,
        activated_at: now,
      }))
    );
  }

  // Issue #99: net-new call site - no stub existed for this event. Per the
  // Guide's Spec Tension, transactions.payment_status = 'Fully Paid' is the
  // trigger condition assumed here (the field Modules-Features actually
  // names), fired regardless of payment channel. Only fires once, at
  // checkout time - a Pending PayMongo transaction later confirmed by
  // webhookConfirmation.service.ts does not currently re-fire this event;
  // flagged here for the reviewer alongside the Guide's own open question.
  if ((transaction as Transaction).payment_status === 'Fully Paid') {
    await sendPaymentConfirmedNotification(transaction as Transaction);
  }

  // Roll the booking's payment_status up from the transaction just written
  // (the rework made bookings.payment_status the source of truth for "is this
  // paid" - startBooking, the slot gate, DSR all read it). Best-effort: a
  // failure here must not fail an otherwise-complete checkout. A still-Pending
  // GCash/Maya checkout stays Pending until the webhook confirms.
  try {
    await recomputeBookingPaymentStatus(input.booking_id);
  } catch (rollupError) {
    // eslint-disable-next-line no-console
    console.error(
      `checkoutBooking: failed to roll up payment_status for booking ${input.booking_id}:`,
      rollupError
    );
  }

  return {
    transaction: transaction as Transaction,
    lineItems: (lineItems ?? []) as TransactionLineItem[],
    changeAmount,
    paymongoCheckoutUrl,
  };
}

async function sendPaymentConfirmedNotification(
  transaction: Transaction
): Promise<void> {
  try {
    const { data: customer } = await supabase
      .from('customer_profiles')
      .select('account_email')
      .eq('id', transaction.customer_id)
      .maybeSingle();

    await createNotification({
      recipientCustomerId: transaction.customer_id,
      eventType: 'payment_confirmed',
      title: 'Payment confirmed',
      message: `We've received your payment of ₱${Number(transaction.total_amount).toFixed(2)} via ${transaction.payment_method}.`,
      relatedBookingId: transaction.booking_id ?? null,
      sendEmail: customer?.account_email
        ? () =>
            sendPaymentConfirmedEmail({
              to: customer.account_email,
              amount: Number(transaction.total_amount),
              paymentMethod: transaction.payment_method,
            })
        : undefined,
    });
  } catch (error) {
    console.error('Failed to send payment_confirmed notification:', error);
  }
}
