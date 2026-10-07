import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendPaymentConfirmedNotification } from './paymentNotifications.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendPaymentConfirmedEmail } from '../../../shared/email/paymentConfirmedEmail.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import type { Transaction } from '../billing.types.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn(),
}));

vi.mock('../../../shared/email/paymentConfirmedEmail.ts', () => ({
  sendPaymentConfirmedEmail: vi.fn(),
}));

const SETTLED = {
  id: 'txn-1',
  booking_id: 'booking-1',
  booking_group_id: null,
  customer_id: 'customer-1',
  payment_method: 'Cash',
  payment_status: 'Fully Paid',
  total_amount: 200,
} as unknown as Transaction;

function sent() {
  return vi.mocked(createNotification).mock.calls[0]?.[0];
}

describe('paymentNotifications.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createNotification).mockResolvedValue(null);
    vi.mocked(supabase.from).mockImplementation((() => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(() =>
        Promise.resolve({
          data: { account_email: 'owner@example.com' },
          error: null,
        })
      );
      return builder;
    }) as never);
  });

  it('tells the customer the amount received and that the booking is now fully paid', async () => {
    await sendPaymentConfirmedNotification(SETTLED, 0);

    expect(sent()).toMatchObject({
      recipientCustomerId: 'customer-1',
      eventType: 'payment_confirmed',
      title: 'Payment confirmed',
      relatedBookingId: 'booking-1',
      message:
        "We've received your payment of ₱200.00 via Cash. Your booking is now fully paid.",
    });
  });

  it('says what is still owed after a partial payment', async () => {
    await sendPaymentConfirmedNotification(SETTLED, 300);

    expect(sent()?.message).toBe(
      "We've received your payment of ₱200.00 via Cash. Remaining balance: ₱300.00."
    );
  });

  it('is just the receipt when the caller does not know the balance (checkout)', async () => {
    await sendPaymentConfirmedNotification(SETTLED);

    expect(sent()?.message).toBe(
      "We've received your payment of ₱200.00 via Cash."
    );
  });

  it('emails the same details', async () => {
    await sendPaymentConfirmedNotification(SETTLED, 300);
    await sent()?.sendEmail?.();

    expect(sendPaymentConfirmedEmail).toHaveBeenCalledWith({
      to: 'owner@example.com',
      amount: 200,
      paymentMethod: 'Cash',
      balanceNote: 'Remaining balance: ₱300.00.',
    });
  });

  it('never fails the payment when the notification cannot be created', async () => {
    vi.mocked(createNotification).mockRejectedValue(new Error('db down'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(
      sendPaymentConfirmedNotification(SETTLED, 0)
    ).resolves.toBeUndefined();

    consoleError.mockRestore();
  });
});
