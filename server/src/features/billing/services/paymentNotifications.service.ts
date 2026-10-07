import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendPaymentConfirmedEmail } from '../../../shared/email/paymentConfirmedEmail.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import type { Transaction } from '../billing.types.ts';

function peso(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}

/**
 * Tells the customer a payment of theirs was confirmed, and for how much -
 * sent from checkout and from the Transactions page's counter and credit
 * settlements alike.
 *
 * `remainingBalance` is what is still owed on the booking after this payment,
 * when the caller knows it: 0 adds "now fully paid", more than 0 adds the
 * amount left. Left out (checkout), the message is just the receipt.
 *
 * Best-effort: the payment is already recorded, so a failure here is logged
 * and never fails or undoes it.
 */
export async function sendPaymentConfirmedNotification(
  transaction: Transaction,
  remainingBalance?: number
): Promise<void> {
  try {
    const { data: customer } = await supabase
      .from('customer_profiles')
      .select('account_email')
      .eq('id', transaction.customer_id)
      .maybeSingle();

    const amount = Number(transaction.total_amount);
    const balanceNote =
      remainingBalance === undefined
        ? null
        : remainingBalance > 0
          ? `Remaining balance: ${peso(remainingBalance)}.`
          : 'Your booking is now fully paid.';

    await createNotification({
      recipientCustomerId: transaction.customer_id,
      eventType: 'payment_confirmed',
      title: 'Payment confirmed',
      message: `We've received your payment of ${peso(amount)} via ${transaction.payment_method}.${balanceNote ? ` ${balanceNote}` : ''}`,
      relatedBookingId: transaction.booking_id ?? null,
      sendEmail: customer?.account_email
        ? () =>
            sendPaymentConfirmedEmail({
              to: customer.account_email,
              amount,
              paymentMethod: transaction.payment_method,
              balanceNote,
            })
        : undefined,
    });
  } catch (error) {
    console.error('Failed to send payment_confirmed notification:', error);
  }
}
