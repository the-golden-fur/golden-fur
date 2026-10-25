import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isFeatureEnabled,
  listFeatureFlags,
  setFeatureFlag,
} from './featureFlags.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

const builders: Array<Record<string, ReturnType<typeof vi.fn>>> = [];

/** Each supabase.from() call consumes the next queued result. */
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  builders.length = 0;

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.upsert = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    builders.push(builder as Record<string, ReturnType<typeof vi.fn>>);
    return builder as never;
  });
}

describe('featureFlags.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every known flag, defaulting a missing row to off', async () => {
    queueFromResults({ data: [], error: null });

    expect(await listFeatureFlags()).toEqual({ spin_wheel: false });
  });

  it('reads a stored flag and ignores unknown keys', async () => {
    queueFromResults({
      data: [
        { key: 'spin_wheel', enabled: true },
        { key: 'something_else', enabled: true },
      ],
      error: null,
    });

    expect(await listFeatureFlags()).toEqual({ spin_wheel: true });
  });

  it('isFeatureEnabled is false when the row is missing', async () => {
    queueFromResults({ data: null, error: null });

    expect(await isFeatureEnabled('spin_wheel')).toBe(false);
  });

  it('setFeatureFlag upserts the row with who changed it, then returns every flag', async () => {
    queueFromResults(
      { data: null, error: null }, // upsert
      { data: [{ key: 'spin_wheel', enabled: true }], error: null } // re-list
    );

    const flags = await setFeatureFlag({
      key: 'spin_wheel',
      enabled: true,
      requesterId: 'superadmin-1',
    });

    expect(flags).toEqual({ spin_wheel: true });
    expect(builders[0].upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'spin_wheel',
        enabled: true,
        updated_by_staff_id: 'superadmin-1',
      })
    );
  });

  it('setFeatureFlag 404s an unknown feature without touching the table', async () => {
    await expect(
      setFeatureFlag({ key: 'nope', enabled: true, requesterId: 'sa-1' })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
