import type { Consultation } from '../veterinary.types.ts';
import {
  insertPendingCharge,
  loadChargeBooking,
  moveBookingTotal,
  type PharmacyLine,
} from './pharmacyCharge.service.ts';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One thing the vet did at the visit and what it costs (e.g. Surgery,
 * 10,000) - typed in, or picked from the shared service list and adjusted. */
export interface ServiceDone {
  name: string;
  amount: number;
}

interface PostServicesDoneChargeParams {
  consultation: Pick<Consultation, 'id' | 'booking_id'>;
  lines: ServiceDone[];
  /** The vet completing the visit - recorded on the charge. */
  requesterId: string;
}

/**
 * Vet-priced visits: bills what the vet says was done at a visit as one
 * Pending transaction on the visit's booking, a line per service, and adds
 * it to the booking total - so a free Follow-up Consultation (or a regular
 * one) ends up owing exactly what was done. Same posting path as the
 * medicine sale (insertPendingCharge / moveBookingTotal); the cashier
 * collects it on the Transactions page, or the customer pays it with credit.
 *
 * Posted once, when the visit is completed. Unlike the medicine sale it is
 * NOT linked from the consultation: to checkoutAggregation.service.ts it is
 * simply the visit's service charge, so a cashier running checkout on the
 * booking either replaces an unpaid one with an identical bill (built from
 * the same consultation_line_items rows) or is blocked by a paid one - never
 * a second charge.
 *
 * Nothing listed, or everything listed was free: nothing is posted.
 */
export async function postServicesDoneCharge({
  consultation,
  lines,
  requesterId,
}: PostServicesDoneChargeParams): Promise<void> {
  const chargeLines: PharmacyLine[] = lines.map((line) => ({
    description: line.name,
    quantity: 1,
    unit_price: round2(line.amount),
    line_total: round2(line.amount),
  }));
  const total = round2(
    chargeLines.reduce((sum, line) => sum + line.line_total, 0)
  );

  if (total <= 0) return;

  const booking = await loadChargeBooking(consultation.booking_id);

  await insertPendingCharge({
    booking,
    consultationId: consultation.id,
    lines: chargeLines,
    requesterId,
    label: 'services',
  });

  await moveBookingTotal(booking, total);
}
