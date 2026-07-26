import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPricingConfiguration,
  updatePricingConfiguration,
} from './pricingConfiguration.service.ts';
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
  id: 'pricing-config-1',
  size_s_multiplier: 1,
  size_m_multiplier: 1.1,
  size_l_multiplier: 1.25,
  size_xl_multiplier: 1.5,
  long_coat_addon: 0,
};

describe('pricingConfiguration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPricingConfiguration', () => {
    it('#80: returns the singleton row', async () => {
      queueFromResults({ data: CONFIGURATION, error: null });

      const result = await getPricingConfiguration();

      expect(result.id).toBe('pricing-config-1');
    });

    it('surfaces a missing seed row as a 500', async () => {
      queueFromResults({ data: null, error: null });

      await expect(getPricingConfiguration()).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe('updatePricingConfiguration', () => {
    it('#80 AC-2: updates the shared multipliers', async () => {
      queueFromResults(
        { data: CONFIGURATION, error: null }, // existing
        { data: { ...CONFIGURATION, long_coat_addon: 50 }, error: null } // updated
      );

      const result = await updatePricingConfiguration({
        requesterId: 'admin-1',
        updates: { long_coat_addon: 50 },
      });

      expect(result.long_coat_addon).toBe(50);
    });
  });
});
