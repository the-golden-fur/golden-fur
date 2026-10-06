import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentPrescription } from './currentPrescription.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

const selectArgs: string[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    builder.select = vi.fn((arg: string) => {
      selectArgs.push(arg);
      return builder;
    });
    for (const method of ['eq', 'order', 'limit', 'in']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

describe('currentPrescription.service (#66)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectArgs.length = 0;
  });

  it('regression: qualifies the bookings embed with !booking_id, since consultations also has a follow_up_booking_id FK to bookings (an unqualified embed 400s as ambiguous)', async () => {
    queueFromResults({ data: [], error: null });

    await getCurrentPrescription('pet-1');

    expect(selectArgs[0]).toContain('bookings!booking_id!inner');
  });

  it('AC-4: returns the medications from the single most recent Completed/Paid consultation', async () => {
    queueFromResults({
      data: [
        {
          id: 'consultation-1',
          medications: [{ name: 'Rimadyl', dose: '75mg', notes: null }],
          booking: {
            status: 'Completed',
            completed_at: '2026-07-01T00:00:00.000Z',
          },
        },
        {
          id: 'consultation-2',
          medications: [{ name: 'Amoxicillin', dose: '50mg', notes: null }],
          booking: {
            status: 'Completed',
            completed_at: '2026-07-19T00:00:00.000Z',
          },
        },
      ],
      error: null,
    });

    const result = await getCurrentPrescription('pet-1');

    expect(result).toMatchObject({
      consultation_id: 'consultation-2',
      medications: [{ name: 'Amoxicillin', dose: '50mg' }],
    });
  });

  it('AC-4: returns null when the pet has no finished (Completed/Paid) consultation', async () => {
    queueFromResults({ data: [], error: null });

    const result = await getCurrentPrescription('pet-1');

    expect(result).toBeNull();
  });
});
