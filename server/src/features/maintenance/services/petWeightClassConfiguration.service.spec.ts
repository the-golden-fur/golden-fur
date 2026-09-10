import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPetWeightClassConfiguration,
  updatePetWeightClassConfiguration,
} from './petWeightClassConfiguration.service.ts';
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
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const CONFIGURATION = {
  id: 'weight-class-config-1',
  m_min_kg: 9.5,
  l_min_kg: 22,
  xl_min_kg: 41,
  updated_by_staff_id: null,
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('petWeightClassConfiguration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPetWeightClassConfiguration', () => {
    it('returns the singleton row', async () => {
      queueFromResults({ data: CONFIGURATION, error: null });

      const result = await getPetWeightClassConfiguration();

      expect(result.id).toBe('weight-class-config-1');
    });

    it('surfaces a missing seed row as a 500', async () => {
      queueFromResults({ data: null, error: null });

      await expect(getPetWeightClassConfiguration()).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe('updatePetWeightClassConfiguration', () => {
    it('updates the cut-offs', async () => {
      queueFromResults(
        { data: CONFIGURATION, error: null },
        { data: { ...CONFIGURATION, l_min_kg: 25 }, error: null }
      );

      const result = await updatePetWeightClassConfiguration({
        requesterId: 'admin-1',
        updates: { l_min_kg: 25 },
      });

      expect(result.l_min_kg).toBe(25);
    });

    it('rejects a partial update that would break m < l < xl', async () => {
      queueFromResults({ data: CONFIGURATION, error: null });

      await expect(
        updatePetWeightClassConfiguration({
          requesterId: 'admin-1',
          updates: { l_min_kg: 50 }, // would land above xl_min_kg (41)
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
