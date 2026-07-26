import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listPromoCapConfigurations,
  upsertPromoCapConfiguration,
} from './promoCap.service.ts';
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
    builder.is = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const DEFAULT_CAP = {
  id: 'cap-default',
  branch_id: null,
  cap_type: 'percentage',
  cap_value: 20,
};

describe('promoCap.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPromoCapConfigurations', () => {
    it('#84: lists every cap row, default first', async () => {
      queueFromResults({
        data: [
          DEFAULT_CAP,
          { id: 'cap-makati', branch_id: 'branch-makati', cap_type: 'flat', cap_value: 100 },
        ],
        error: null,
      });

      const result = await listPromoCapConfigurations();

      expect(result).toHaveLength(2);
    });
  });

  describe('upsertPromoCapConfiguration', () => {
    it('#84 AC-4: updates the existing default cap when one is already seeded', async () => {
      queueFromResults(
        { data: { id: 'cap-default' }, error: null }, // lookup
        { data: { ...DEFAULT_CAP, cap_value: 25 }, error: null } // update
      );

      const result = await upsertPromoCapConfiguration({
        requesterId: 'admin-1',
        input: { branch_id: null, cap_type: 'percentage', cap_value: 25 },
      });

      expect(result.cap_value).toBe(25);
    });

    it('creates a new per-branch cap row when none exists yet for that branch', async () => {
      queueFromResults(
        { data: null, error: null }, // lookup finds nothing
        {
          data: {
            id: 'cap-south',
            branch_id: 'branch-south',
            cap_type: 'flat',
            cap_value: 150,
          },
          error: null,
        } // insert
      );

      const result = await upsertPromoCapConfiguration({
        requesterId: 'admin-1',
        input: { branch_id: 'branch-south', cap_type: 'flat', cap_value: 150 },
      });

      expect(result.branch_id).toBe('branch-south');
      expect(result.cap_value).toBe(150);
    });
  });
});
