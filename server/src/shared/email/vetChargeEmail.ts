import { sendEmail } from './brevo.client.ts';

export interface VetChargeEmailParams {
  to: string;
  petName: string;
  branchName: string;
  /** The same sentence(s) the in-app notification carries. */
  message: string;
}

/**
 * Custom change (vet-priced visits): fired by
 * vetChargeNotifications.service.ts when a veterinarian's save puts a charge
 * on the customer's booking, or changes or removes one.
 */
export async function sendVetChargeEmail({
  to,
  petName,
  branchName,
  message,
}: VetChargeEmailParams): Promise<void> {
  const subject = `Golden Fur - Charges for ${petName}'s veterinary visit`;

  const html = `
    <p>This is about ${petName}'s veterinary visit at Golden Fur ${branchName}.</p>
    <p>${message}</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
