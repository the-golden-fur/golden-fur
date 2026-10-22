import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendNotificationEmail } from '../../../shared/email/notificationEmail.ts';

/**
 * `sendEmail` thunks for createNotification that mirror the notification's
 * own title and message by email (shared/email/notificationEmail.ts). The
 * recipient's address is looked up inside the thunk, so it only costs a query
 * when createNotification has already decided the recipient wants the email.
 * No address on file = nothing to send, not an error.
 */
export function customerNotificationEmail(
  customerId: string,
  title: string,
  message: string
): () => Promise<void> {
  return async () => {
    const { data } = await supabase
      .from('customer_profiles')
      .select('account_email')
      .eq('id', customerId)
      .maybeSingle();

    if (!data?.account_email) return;

    await sendNotificationEmail({
      to: data.account_email as string,
      title,
      message,
    });
  };
}

export function staffNotificationEmail(
  staffId: string,
  title: string,
  message: string
): () => Promise<void> {
  return async () => {
    const { data } = await supabase
      .from('staff_profiles')
      .select('registered_email')
      .eq('id', staffId)
      .maybeSingle();

    if (!data?.registered_email) return;

    await sendNotificationEmail({
      to: data.registered_email as string,
      title,
      message,
    });
  };
}
