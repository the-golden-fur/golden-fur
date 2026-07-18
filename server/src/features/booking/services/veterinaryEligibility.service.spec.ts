import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertVeterinaryBranchEligibility } from './veterinaryEligibility.service.ts';
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
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const MAKATI = { id: 'branch-makati', name: 'Makati', is_vet_branch: true };
const SOUTHWOODS = {
  id: 'branch-south',
  name: 'Southwoods',
  is_vet_branch: false,
};

describe('veterinaryEligibility.service (#53)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-3: a Veterinary booking at a vet branch (Makati) passes the guard', async () => {
    queueFromResults({ data: MAKATI, error: null });

    await expect(
      assertVeterinaryBranchEligibility({
        branchId: MAKATI.id,
        serviceCategory: 'Veterinary',
      })
    ).resolves.toBeUndefined();
  });

  it('AC-1: a Veterinary booking at a non-vet branch is rejected with a distinct 422 (not a capacity error)', async () => {
    queueFromResults({ data: SOUTHWOODS, error: null });

    await expect(
      assertVeterinaryBranchEligibility({
        branchId: SOUTHWOODS.id,
        serviceCategory: 'Veterinary',
      })
    ).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('Makati'),
    });
  });

  it('AC-2: non-Veterinary categories pass at any branch without even querying branches', async () => {
    for (const category of ['Grooming', 'Hotel', 'Daycare'] as const) {
      await expect(
        assertVeterinaryBranchEligibility({
          branchId: SOUTHWOODS.id,
          serviceCategory: category,
        })
      ).resolves.toBeUndefined();
    }

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('404s on an unknown branch', async () => {
    queueFromResults({ data: null, error: null });

    await expect(
      assertVeterinaryBranchEligibility({
        branchId: 'branch-missing',
        serviceCategory: 'Veterinary',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
