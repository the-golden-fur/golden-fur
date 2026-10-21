import { postCheckoutExtras } from '../../billing/services/checkoutExtrasCharge.service.ts';
import type { Transaction } from '../../billing/billing.types.ts';
import { DAYCARE_OVERDUE_FEE_PER_HOUR } from '../modules/daycareCharge.util.ts';

interface PostDaycareOverdueChargeParams {
  bookingId: string;
  /** Whole overdue hours billed (after the grace period). */
  overdueHours: number;
  /** overdueHours x the flat overdue rate. */
  overdueFee: number;
  /** Daycare hours the pet stayed beyond those charged at booking - e.g. it
   * was checked in earlier than booked. Left out when there are none. */
  additionalHours?: { charge: number };
  /** The nights a pet that was not picked up before closing stayed, billed
   * at the branch's Hotel nightly rate - left out for a same-day pickup. */
  overnight?: { nights: number; nightlyRate: number; charge: number };
  /** Who checked the pet out - recorded on a newly-created charge. */
  requesterId?: string;
}

/**
 * Puts what a Daycare checkout charges on top of what was charged at booking
 * - Daycare hours beyond those booked, the overdue checkout fee, and the
 * night(s) of a pet that was not picked up before closing - onto the
 * booking's `transactions`, so the cashier sees it and can collect it.
 *
 * A booking's charges are created up front, at booking time, from the hours
 * that were booked (create_initial_booking_charge) - these extras only exist
 * once the pet is actually checked out late, so nothing would ever add them
 * to those charges otherwise: they would sit on stays.computed_charge,
 * invisible to the Transactions list. How they are posted (joining an open
 * Pending balance or opening a new one) is postCheckoutExtras's own job,
 * shared with the Hotel late checkout fee.
 */
export async function postDaycareOverdueCharge({
  bookingId,
  overdueHours,
  overdueFee,
  additionalHours,
  overnight,
  requesterId,
}: PostDaycareOverdueChargeParams): Promise<Transaction> {
  const lines = [
    ...(additionalHours && additionalHours.charge > 0
      ? [
          {
            description: 'Daycare hours beyond those booked',
            quantity: 1,
            unit_price: additionalHours.charge,
            line_total: additionalHours.charge,
          },
        ]
      : []),
    ...(overdueFee > 0
      ? [
          {
            description: `Daycare overdue checkout fee (${overdueHours} hour${
              overdueHours === 1 ? '' : 's'
            } x ₱${DAYCARE_OVERDUE_FEE_PER_HOUR})`,
            quantity: overdueHours,
            unit_price: DAYCARE_OVERDUE_FEE_PER_HOUR,
            line_total: overdueFee,
          },
        ]
      : []),
    ...(overnight && overnight.charge > 0
      ? [
          {
            description: `Daycare overnight stay - not picked up (${overnight.nights} night${
              overnight.nights === 1 ? '' : 's'
            } x ₱${overnight.nightlyRate})`,
            quantity: overnight.nights,
            unit_price: overnight.nightlyRate,
            line_total: overnight.charge,
          },
        ]
      : []),
  ];

  return postCheckoutExtras({ bookingId, lines, requesterId });
}
