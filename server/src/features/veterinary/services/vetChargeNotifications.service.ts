import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendVetChargeEmail } from '../../../shared/email/vetChargeEmail.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import type { Consultation } from '../veterinary.types.ts';
import type { PharmacyChargePlan } from './pharmacyCharge.service.ts';
import type { ServiceDone } from './serviceCharge.service.ts';

/** One charged thing as the customer reads it. */
export interface VetChargeLine {
  description: string;
  quantity: number;
  line_total: number;
}

/** 'posted' = new charges; 'updated' = the medicine charge changed;
 * 'removed' = the medicine charge was taken off the bill. */
export type VetChargeKind = 'posted' | 'updated' | 'removed';

interface SendVetChargeNotificationParams {
  consultation: Pick<Consultation, 'id' | 'booking_id' | 'pet_id'>;
  kind: VetChargeKind;
  /** What is charged after this save - empty for 'removed'. */
  lines: VetChargeLine[];
  /** The amount the customer is told: the lines' total, or for 'removed'
   * the amount that came off. */
  total: number;
}

function peso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function itemize(lines: VetChargeLine[]): string {
  return lines
    .map(
      (line) =>
        `${line.description}${line.quantity > 1 ? ` x${line.quantity}` : ''} ${peso(line.line_total)}`
    )
    .join(', ');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumLines(lines: VetChargeLine[]): number {
  return round2(lines.reduce((sum, line) => sum + line.line_total, 0));
}

type NotifiedConsultation = Pick<Consultation, 'id' | 'booking_id' | 'pet_id'>;

/**
 * A visit was just completed: one notification for everything that save
 * charged - the services the vet listed as done plus a pharmacy medicine
 * sale. Nothing is sent when nothing was charged.
 */
export async function notifyVisitCharges({
  consultation,
  servicesDone,
  pharmacyPlan,
}: {
  consultation: NotifiedConsultation;
  servicesDone: ServiceDone[];
  pharmacyPlan: PharmacyChargePlan | null;
}): Promise<void> {
  const lines: VetChargeLine[] = [
    ...servicesDone.map((service) => ({
      description: service.name,
      quantity: 1,
      line_total: round2(service.amount),
    })),
    ...(pharmacyPlan && !pharmacyPlan.locked ? pharmacyPlan.lines : []),
  ];
  const total = sumLines(lines);

  if (total <= 0) return;

  await sendVetChargeNotification({
    consultation,
    kind: 'posted',
    lines,
    total,
  });
}

/**
 * A finished visit's prescription was just edited: tells the customer when
 * that added, changed or removed the medicine charge. Silent when the amount
 * is the same as before (e.g. only the diagnosis was corrected) or the
 * charge is already paid and so left alone.
 */
export async function notifyMedicineChargeChange({
  consultation,
  plan,
}: {
  consultation: NotifiedConsultation;
  plan: PharmacyChargePlan;
}): Promise<void> {
  if (plan.locked) return;

  const previousTotal = round2(plan.existing?.total_amount ?? 0);
  const total = sumLines(plan.lines);

  if (total === previousTotal) return;

  const kind: VetChargeKind =
    previousTotal === 0 ? 'posted' : total === 0 ? 'removed' : 'updated';

  await sendVetChargeNotification({
    consultation,
    kind,
    lines: plan.lines,
    total: kind === 'removed' ? previousTotal : total,
  });
}

const HOW_TO_PAY = 'Pay at the counter or with your account credit.';

export function buildVetChargeMessage(
  petName: string,
  kind: VetChargeKind,
  lines: VetChargeLine[],
  total: number
): { title: string; message: string } {
  if (kind === 'removed') {
    return {
      title: 'Medicine charge removed',
      message: `The ${peso(total)} medicine charge for ${petName}'s veterinary visit was removed from your bill.`,
    };
  }

  if (kind === 'updated') {
    return {
      title: 'Medicine charge updated',
      message: `The medicine charge for ${petName}'s veterinary visit was updated: ${itemize(lines)}. Total ${peso(total)}. ${HOW_TO_PAY}`,
    };
  }

  return {
    title: 'Veterinary charges added',
    message: `Charges were added for ${petName}'s veterinary visit: ${itemize(lines)}. Total ${peso(total)}. ${HOW_TO_PAY}`,
  };
}

/**
 * Vet-priced visits: tells the customer what a veterinarian's save charged
 * them and how much - the services done at a visit and/or a pharmacy
 * medicine sale. One notification per save, itemized.
 *
 * Best-effort, like every other sender: the charge is already saved, so a
 * failure here is logged and never fails or undoes the vet's save.
 */
export async function sendVetChargeNotification({
  consultation,
  kind,
  lines,
  total,
}: SendVetChargeNotificationParams): Promise<void> {
  try {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, customer_id, branch_id')
      .eq('id', consultation.booking_id)
      .maybeSingle();

    if (!booking) return;

    const [{ data: customer }, { data: branch }, { data: pet }] =
      await Promise.all([
        supabase
          .from('customer_profiles')
          .select('account_email')
          .eq('id', booking.customer_id)
          .maybeSingle(),
        supabase
          .from('branches')
          .select('name')
          .eq('id', booking.branch_id)
          .maybeSingle(),
        supabase
          .from('pets')
          .select('name')
          .eq('id', consultation.pet_id)
          .maybeSingle(),
      ]);

    const petName = pet?.name ?? 'your pet';
    const { title, message } = buildVetChargeMessage(
      petName,
      kind,
      lines,
      total
    );

    await createNotification({
      recipientCustomerId: booking.customer_id,
      eventType: 'vet_charge_posted',
      title,
      message,
      relatedBookingId: booking.id,
      sendEmail: customer?.account_email
        ? () =>
            sendVetChargeEmail({
              to: customer.account_email,
              petName,
              branchName: branch?.name ?? '',
              message,
            })
        : undefined,
    });
  } catch (error) {
    console.error(
      `Failed to send vet_charge_posted notification for consultation ${consultation.id}:`,
      error
    );
  }
}
