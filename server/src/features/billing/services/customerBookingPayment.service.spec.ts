import { beforeEach, describe, expect, it, vi } from 'vitest';
import { payForBooking } from './customerBookingPayment.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getBookingById } from '../../booking/services/booking.service.ts';
import { isOnlinePaymentsEnabled } from '../../booking/services/staffPicker.service.ts';
import { initiatePaymongoPayment } from './paymongo.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  getBookingById: vi.fn(),
}));

vi.mock('../../booking/services/staffPicker.service.ts', () => ({
  isOnlinePaymentsEnabled: vi.fn(),
}));

vi.mock('./paymongo.service.ts', () => ({
  initiatePaymongoPayment: vi.fn(),
}));

const CUSTOMER_ID = 'customer-1';

const UNPAID_BOOKING = {
  id: 'booking-1',
  customer_id: CUSTOMER_ID,
  branch_id: 'branch-1',
  payment_stage: 'Unpaid',
  total_price: 1000,
  downpayment_required: true,
  downpayment_amount: 500,
};

function mockInsertTransaction(result: { data: unknown; error: unknown }) {
  vi.mocked(supabase.from).mockImplementation((() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve(result)),
      })),
    })),
  })) as never);
}

describe('customerBookingPayment.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOnlinePaymentsEnabled).mockResolvedValue(true);
    vi.mocked(initiatePaymongoPayment).mockResolvedValue({
      sourceId: 'src_123',
      checkoutUrl: 'https://paymongo.test/checkout/src_123',
    });
  });

  it('rejects a caller who is not the booking owner', async () => {
    vi.mocked(getBookingById).mockResolvedValue({
      ...UNPAID_BOOKING,
      customer_id: 'someone-else',
    } as never);

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: true,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects paying an already fully-paid booking', async () => {
    vi.mocked(getBookingById).mockResolvedValue({
      ...UNPAID_BOOKING,
      payment_stage: 'Paid',
    } as never);

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: true,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a downpayment choice when the booking does not require one', async () => {
    vi.mocked(getBookingById).mockResolvedValue({
      ...UNPAID_BOOKING,
      downpayment_required: false,
      downpayment_amount: null,
    } as never);

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: false,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when online payments are disabled for the branch', async () => {
    vi.mocked(getBookingById).mockResolvedValue(UNPAID_BOOKING as never);
    vi.mocked(isOnlinePaymentsEnabled).mockResolvedValue(false);

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: true,
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(initiatePaymongoPayment).not.toHaveBeenCalled();
  });

  it('surfaces a PayMongo failure as a 502 with a friendly message', async () => {
    vi.mocked(getBookingById).mockResolvedValue(UNPAID_BOOKING as never);
    vi.mocked(initiatePaymongoPayment).mockRejectedValue(new Error('boom'));

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: true,
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('unavailable'),
    });
  });

  it('pays the full total_price when payInFull is true, tagging the transaction customer/full', async () => {
    vi.mocked(getBookingById).mockResolvedValue(UNPAID_BOOKING as never);
    mockInsertTransaction({
      data: { id: 'txn-1', total_amount: 1000 },
      error: null,
    });

    const result = await payForBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      paymentMethod: 'GCash',
      payInFull: true,
    });

    expect(initiatePaymongoPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000, paymentMethod: 'GCash' })
    );
    expect(supabase.from).toHaveBeenCalledWith('transactions');
    expect(result.checkoutUrl).toBe('https://paymongo.test/checkout/src_123');
  });

  it('pays only the downpayment_amount when payInFull is false and a downpayment is required', async () => {
    vi.mocked(getBookingById).mockResolvedValue(UNPAID_BOOKING as never);
    mockInsertTransaction({
      data: { id: 'txn-1', total_amount: 500 },
      error: null,
    });

    await payForBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      paymentMethod: 'Maya',
      payInFull: false,
    });

    expect(initiatePaymongoPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500, paymentMethod: 'Maya' })
    );
  });

  it('a "Paid in Advance" booking always pays only the remaining balance, regardless of payInFull', async () => {
    vi.mocked(getBookingById).mockResolvedValue({
      ...UNPAID_BOOKING,
      payment_stage: 'Paid in Advance',
    } as never);
    mockInsertTransaction({
      data: { id: 'txn-1', total_amount: 500 },
      error: null,
    });

    await payForBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      paymentMethod: 'GCash',
      payInFull: false,
    });

    // total_price 1000 - downpayment_amount 500 already paid = 500 remaining
    expect(initiatePaymongoPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500 })
    );
  });
});
