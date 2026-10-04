import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getServiceLineItems,
  type BookingForBilling,
} from './lineItemSources.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

function staysResult(data: unknown) {
  vi.mocked(supabase.from).mockImplementation((() => {
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve({ data, error: null }));

    return builder;
  }) as never);
}

const DAYCARE_BOOKING = {
  id: 'booking-1',
  service_category: 'Daycare',
  items: [],
  downpayment_required: false,
  downpayment_amount: null,
} as unknown as BookingForBilling;

describe('lineItemSources.service - Daycare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bills an on-time session as one Daycare session line', async () => {
    staysResult({ computed_charge: 150, extension_fee: null });

    await expect(getServiceLineItems(DAYCARE_BOOKING)).resolves.toEqual([
      expect.objectContaining({
        description: 'Daycare session',
        line_total: 150,
      }),
    ]);
  });

  it('splits the overdue checkout fee out into its own line, adding up to the stored charge', async () => {
    staysResult({ computed_charge: 250, extension_fee: 100 });

    const lines = await getServiceLineItems(DAYCARE_BOOKING);

    expect(lines).toEqual([
      expect.objectContaining({
        description: 'Daycare session',
        line_total: 150,
      }),
      expect.objectContaining({
        description: 'Overdue checkout fee (2 hours x ₱50)',
        quantity: 2,
        unit_price: 50,
        line_total: 100,
      }),
    ]);
    expect(lines.reduce((sum, line) => sum + line.line_total, 0)).toBe(250);
  });

  it('refuses a session that has not been checked out yet', async () => {
    staysResult({ computed_charge: null, extension_fee: null });

    await expect(getServiceLineItems(DAYCARE_BOOKING)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
