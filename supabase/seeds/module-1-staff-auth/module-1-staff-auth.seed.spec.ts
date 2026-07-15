import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBranches, seedStaff } from './module-1-staff-auth.seed.ts';

// Mimics the real PostgrestFilterBuilder: `.select(...)` returns a builder
// that is both awaitable (resolves to { data: <all rows>, error }) and
// chainable via `.eq(...).maybeSingle()`, since seedBranches uses the eq/
// maybeSingle chain while seedStaff awaits `.select(...)` directly.
function selectBuilder<T extends { [key: string]: unknown }>(
  rows: Map<string, T>
) {
  const builder: PromiseLike<{ data: T[]; error: null }> & {
    eq: (
      col: string,
      value: string
    ) => { maybeSingle: () => Promise<{ data: T | null; error: null }> };
  } = {
    then: (onFulfilled) =>
      Promise.resolve({ data: [...rows.values()], error: null }).then(
        onFulfilled as never
      ),
    eq: (_col: string, value: string) => ({
      maybeSingle: () =>
        Promise.resolve({ data: rows.get(value) ?? null, error: null }),
    }),
  };

  return builder;
}

function createMockSupabase() {
  const state = {
    branches: new Map<string, { id: string; name: string }>(),
    staffProfiles: new Map<string, { role: string; branch_id: string }>(),
  };

  let userCounter = 0;
  const createUser = vi.fn(async () => {
    userCounter += 1;
    return { data: { user: { id: `user-${userCounter}` } }, error: null };
  });

  const supabase = {
    auth: { admin: { createUser } },
    from: vi.fn((table: string) => {
      if (table === 'branches') {
        return {
          select: () => selectBuilder(state.branches),
          insert: (row: { name: string }) => {
            state.branches.set(row.name, {
              id: `branch-${row.name.toLowerCase()}`,
              name: row.name,
            });
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'staff_profiles') {
        return {
          select: () => selectBuilder(state.staffProfiles),
          insert: (row: {
            registered_email: string;
            role: string;
            branch_id: string;
          }) => {
            state.staffProfiles.set(row.registered_email, {
              role: row.role,
              branch_id: row.branch_id,
            });
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    }),
    state,
  };

  return supabase;
}

async function seedFullModule(supabase: ReturnType<typeof createMockSupabase>) {
  await seedBranches(supabase as never);
  await seedStaff(supabase as never);
}

describe('module-1-staff-auth seed', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('seedBranches', () => {
    it('creates both branches and is idempotent', async () => {
      await seedBranches(supabase as never);
      await expect(seedBranches(supabase as never)).resolves.not.toThrow();

      expect(supabase.state.branches.size).toBe(2);
      expect([...supabase.state.branches.keys()].sort()).toEqual([
        'Makati',
        'Southwoods',
      ]);
    });
  });

  describe('seedStaff + seedBranches together', () => {
    it('creates 2 accounts per staff_role per branch (2 branches x 8 roles x 2 = 32 total)', async () => {
      await seedFullModule(supabase);

      const rows = [...supabase.state.staffProfiles.values()];

      expect(rows).toHaveLength(32);

      const roles = rows.map((r) => r.role);
      expect(new Set(roles).size).toBe(8);
      for (const role of new Set(roles)) {
        expect(roles.filter((r) => r === role)).toHaveLength(4); // 2 branches x 2 accounts
      }

      const makatiCount = rows.filter(
        (r) => r.branch_id === 'branch-makati'
      ).length;
      const southwoodsCount = rows.filter(
        (r) => r.branch_id === 'branch-southwoods'
      ).length;
      expect(makatiCount).toBe(16);
      expect(southwoodsCount).toBe(16);
    });

    it('generates the branch.roleN@goldenfur.com email pattern', async () => {
      await seedFullModule(supabase);

      expect([...supabase.state.staffProfiles.keys()]).toEqual(
        expect.arrayContaining([
          'makati.admin1@goldenfur.com',
          'makati.admin2@goldenfur.com',
          'southwoods.superadmin1@goldenfur.com',
          'southwoods.superadmin2@goldenfur.com',
        ])
      );
    });

    it('is idempotent: re-running does not duplicate rows or throw', async () => {
      await seedFullModule(supabase);
      await expect(seedFullModule(supabase)).resolves.not.toThrow();

      expect(supabase.state.staffProfiles.size).toBe(32);
      expect(supabase.auth.admin.createUser).toHaveBeenCalledTimes(32);
    });
  });
});
