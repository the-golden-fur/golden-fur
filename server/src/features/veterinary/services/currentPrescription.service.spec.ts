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

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'order', 'limit']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));

    return builder as never;
  });
}

describe('currentPrescription.service (#66)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-4: returns the medications from the single most recent Completed consultation', async () => {
    queueFromResults({
      data: {
        id: 'consultation-2',
        medications: [{ name: 'Amoxicillin', dose: '50mg', notes: null }],
        completed_at: '2026-07-19T00:00:00.000Z',
      },
      error: null,
    });

    const result = await getCurrentPrescription('pet-1');

    expect(result).toMatchObject({
      consultation_id: 'consultation-2',
      medications: [{ name: 'Amoxicillin', dose: '50mg' }],
    });
  });

  it('AC-4: returns null when the pet has no Completed consultation', async () => {
    queueFromResults({ data: null, error: null });

    const result = await getCurrentPrescription('pet-1');

    expect(result).toBeNull();
  });
});
