import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listHotelStays } from './hotelStay.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
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

    for (const method of ['select', 'eq', 'order']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

describe('hotelStay.service (#79 revision)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flattens the joined cage_label onto each stay', async () => {
    queueFromResults({
      data: [
        {
          id: 'stay-1',
          booking_id: 'booking-1',
          status: 'Active',
          cages: { branch_id: 'branch-1', cage_label: 'Makati-S-01' },
        },
      ],
      error: null,
    });

    const stays = await listHotelStays({ branchId: 'branch-1' });

    expect(stays).toHaveLength(1);
    expect(stays[0].cage_label).toBe('Makati-S-01');
  });

  it('supports filtering by status', async () => {
    queueFromResults({ data: [], error: null });

    const stays = await listHotelStays({
      branchId: 'branch-1',
      status: 'Active',
    });

    expect(stays).toEqual([]);
  });
});
