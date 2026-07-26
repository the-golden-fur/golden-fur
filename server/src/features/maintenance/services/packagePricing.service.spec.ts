import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPackagePricingConfiguration,
  updatePackagePricingConfiguration,
} from './packagePricing.service.ts';
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
  id: 'package-pricing-1',
  bundle_discount_percentage: 0.1,
};

describe('packagePricing.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPackagePricingConfiguration', () => {
    it('#82: returns the singleton row', async () => {
      queueFromResults({ data: CONFIGURATION, error: null });

      const result = await getPackagePricingConfiguration();

      expect(result.bundle_discount_percentage).toBe(0.1);
    });

    it('surfaces a missing seed row as a 500', async () => {
      queueFromResults({ data: null, error: null });

      await expect(getPackagePricingConfiguration()).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe('updatePackagePricingConfiguration', () => {
    it('#83: updates the shared bundle discount percentage', async () => {
      queueFromResults(
        { data: CONFIGURATION, error: null }, // existing
        {
          data: { ...CONFIGURATION, bundle_discount_percentage: 0.2 },
          error: null,
        }
      );

      const result = await updatePackagePricingConfiguration({
        requesterId: 'admin-1',
        updates: { bundle_discount_percentage: 0.2 },
      });

      expect(result.bundle_discount_percentage).toBe(0.2);
    });
  });
});
