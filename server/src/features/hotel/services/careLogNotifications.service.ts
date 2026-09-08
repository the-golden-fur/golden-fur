import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { resolveEffectivePolicy } from '../../booking/services/staffPicker.service.ts';
import { sendCareLogCompletedEmail } from '../../../shared/email/careLogCompletedEmail.ts';
import type { CareLogEntry } from '../hotel.types.ts';

/**
 * Issue #99: replaces the old fireCareLogCompletedEvent() console.info stub
 * with a real dispatch, called unconditionally from
 * careLogCompletion.service.ts on every completion - the caller no longer
 * gates this on a per-stay flag (the old hotel_stays.notify_opt_in
 * checkbox was staff-only and has been removed); createNotification below
 * consults the customer's own notification_preferences['care_log_completed']
 * as the sole gate.
 *
 * Kept in its own module (not inline in careLogCompletion.service.ts) so the
 * existing completeCareLogEntry unit tests can mock this one function
 * wholesale, rather than needing to account for its extra Supabase lookups
 * in their sequential mock queue.
 *
 * The email leg is now OFF by default: a hotel stay logs many care tasks per
 * pet per day and emailing on every one drained the Brevo 300/day quota. The
 * in-app notification row still fires for each; the customer's inbox gets one
 * nightly summary instead (careLogDailyReport.job.ts). An admin can re-enable
 * per-task email via policy_configurations.care_log_task_email_enabled.
 */
export async function sendCareLogCompletedNotification(
  entry: CareLogEntry,
  petId: string
): Promise<void> {
  try {
    const { data: pet } = await supabase
      .from('pets')
      .select('name, customer_id')
      .eq('id', petId)
      .maybeSingle();

    if (!pet) return;

    const { data: customer } = await supabase
      .from('customer_profiles')
      .select('account_email')
      .eq('id', pet.customer_id)
      .maybeSingle();

    const branchId = entry.stays?.branch_id ?? null;
    const perTaskEmailEnabled = branchId
      ? (await resolveEffectivePolicy(branchId)).care_log_task_email_enabled
      : false;

    await createNotification({
      recipientCustomerId: pet.customer_id,
      eventType: 'care_log_completed',
      title: `Care update for ${pet.name}`,
      message: entry.description,
      sendEmail:
        perTaskEmailEnabled && customer?.account_email
          ? () =>
              sendCareLogCompletedEmail({
                to: customer.account_email,
                petName: pet.name,
                description: entry.description,
              })
          : undefined,
    });
  } catch (error) {
    console.error('Failed to send care_log_completed notification:', error);
  }
}
