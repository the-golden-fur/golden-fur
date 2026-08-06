import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { sendCareLogCompletedEmail } from '../../../shared/email/careLogCompletedEmail.ts';
import type { CareLogEntry } from '../hotel.types.ts';

/**
 * Issue #99: replaces the old fireCareLogCompletedEvent() console.info stub
 * with a real dispatch, called from careLogCompletion.service.ts - still
 * gated by the caller on hotel_stays.notify_opt_in (unchanged from today's
 * behavior: opted-out stays still record the care log entry internally but
 * fire no notification).
 *
 * Kept in its own module (not inline in careLogCompletion.service.ts) so the
 * existing completeCareLogEntry unit tests can mock this one function
 * wholesale, rather than needing to account for its extra Supabase lookups
 * in their sequential mock queue.
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

    await createNotification({
      recipientCustomerId: pet.customer_id,
      eventType: 'care_log_completed',
      title: `Care update for ${pet.name}`,
      message: entry.description,
      sendEmail: customer?.account_email
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
