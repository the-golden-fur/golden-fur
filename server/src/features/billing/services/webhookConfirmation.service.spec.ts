import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmPaymongoWebhookEvent } from './webhookConfirmation.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { advancePaymentStage } from '../../booking/services/booking.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  advancePaymentStage: vi.fn().mockResolvedValue(undefined),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'update']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));

    return builder;
  }) as never);
}

describe('webhookConfirmation.service (#83 AC-2/AC-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flips a Pending transaction to Fully Paid on a paid event', async () => {
    queueFromResults({ data: { id: 'txn-1' }, error: null });

    const result = await confirmPaymongoWebhookEvent({
      eventId: 'evt-1',
      sourceId: 'src_123',
      status: 'paid',
    });

    expect(result).toEqual({ handled: true, transactionId: 'txn-1' });
  });

  it('is idempotent: a second delivery for an already-confirmed transaction is a no-op', async () => {
    // The conditional UPDATE's .eq('payment_status', 'Pending') excludes
    // an already-Fully-Paid row, so the mock returns no matching row.
    queueFromResults({ data: null, error: null });

    const result = await confirmPaymongoWebhookEvent({
      eventId: 'evt-2',
      sourceId: 'src_123',
      status: 'paid',
    });

    expect(result).toEqual({ handled: false, transactionId: null });
  });

  it('a failed event is a no-op and does not touch the transaction', async () => {
    const result = await confirmPaymongoWebhookEvent({
      eventId: 'evt-3',
      sourceId: 'src_456',
      status: 'failed',
    });

    expect(result).toEqual({ handled: false, transactionId: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('a cashier-initiated transaction (initiated_by staff) never advances payment_stage', async () => {
    queueFromResults({
      data: {
        id: 'txn-1',
        booking_id: 'booking-1',
        initiated_by: 'staff',
        payment_choice: null,
      },
      error: null,
    });

    await confirmPaymongoWebhookEvent({
      eventId: 'evt-1',
      sourceId: 'src_123',
      status: 'paid',
    });

    expect(advancePaymentStage).not.toHaveBeenCalled();
  });

  it('a customer-initiated downpayment payment advances payment_stage with choice "advance"', async () => {
    queueFromResults({
      data: {
        id: 'txn-1',
        booking_id: 'booking-1',
        initiated_by: 'customer',
        payment_choice: 'downpayment',
      },
      error: null,
    });

    await confirmPaymongoWebhookEvent({
      eventId: 'evt-1',
      sourceId: 'src_123',
      status: 'paid',
    });

    expect(advancePaymentStage).toHaveBeenCalledWith({
      bookingId: 'booking-1',
      choice: 'advance',
    });
  });

  it('a customer-initiated full payment advances payment_stage with choice "onsite"', async () => {
    queueFromResults({
      data: {
        id: 'txn-1',
        booking_id: 'booking-1',
        initiated_by: 'customer',
        payment_choice: 'full',
      },
      error: null,
    });

    await confirmPaymongoWebhookEvent({
      eventId: 'evt-1',
      sourceId: 'src_123',
      status: 'paid',
    });

    expect(advancePaymentStage).toHaveBeenCalledWith({
      bookingId: 'booking-1',
      choice: 'onsite',
    });
  });

  it('does not fail the webhook if advancing payment_stage throws (e.g. already Paid)', async () => {
    vi.mocked(advancePaymentStage).mockRejectedValueOnce(
      new Error('already paid')
    );
    queueFromResults({
      data: {
        id: 'txn-1',
        booking_id: 'booking-1',
        initiated_by: 'customer',
        payment_choice: 'full',
      },
      error: null,
    });

    const result = await confirmPaymongoWebhookEvent({
      eventId: 'evt-1',
      sourceId: 'src_123',
      status: 'paid',
    });

    expect(result).toEqual({ handled: true, transactionId: 'txn-1' });
  });
});
