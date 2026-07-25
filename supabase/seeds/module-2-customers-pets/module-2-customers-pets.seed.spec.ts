import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCustomers } from './module-2-customers-pets.seed.ts';

function createMockSupabase() {
  const state = {
    customerProfiles: new Map<string, unknown>(),
    pets: new Map<string, unknown[]>(),
  };

  let userCounter = 0;
  const createUser = vi.fn(async () => {
    userCounter += 1;
    return { data: { user: { id: `user-${userCounter}` } }, error: null };
  });

  const supabase = {
    auth: { admin: { createUser } },
    from: vi.fn((table: string) => {
      if (table === 'customer_profiles') {
        return {
          select: () => ({
            eq: (_col: string, email: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: state.customerProfiles.get(email) ?? null,
                  error: null,
                }),
            }),
          }),
          insert: (row: { account_email: string; id: string }) => {
            state.customerProfiles.set(row.account_email, row);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'pets') {
        return {
          select: () => ({
            eq: (_col: string, customerId: string) =>
              Promise.resolve({
                count: (state.pets.get(customerId) ?? []).length,
                error: null,
              }),
          }),
          insert: (rows: { customer_id: string }[]) => {
            const customerId = rows[0]?.customer_id;
            state.pets.set(customerId, [
              ...(state.pets.get(customerId) ?? []),
              ...rows,
            ]);
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

describe('module-2-customers-pets seed', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  it('creates 5 customers, each with 1-2 pets of varied pet_type/weight_class/coat_type', async () => {
    await seedCustomers(supabase as never);

    expect(supabase.state.customerProfiles.size).toBe(5);

    const allPets = [...supabase.state.pets.values()].flat() as {
      pet_type: string;
      weight_class: string;
      coat_type: string;
    }[];

    expect(allPets.length).toBe(8);
    expect(new Set(allPets.map((p) => p.pet_type)).size).toBeGreaterThan(1);
    expect(new Set(allPets.map((p) => p.weight_class)).size).toBeGreaterThan(1);
    expect(new Set(allPets.map((p) => p.coat_type)).size).toBeGreaterThan(1);
  });

  it('sets a placeholder facebook_id on exactly one seed customer (customer1)', async () => {
    await seedCustomers(supabase as never);

    const rows = supabase.state.customerProfiles as Map<
      string,
      { facebook_id: string | null }
    >;

    expect(rows.get('customer1@goldenfur.com')?.facebook_id).toBe(
      'seed-facebook-id-customer1'
    );
    expect([...rows.entries()].filter(([, r]) => !!r.facebook_id)).toHaveLength(
      1
    );
  });

  it('is idempotent: re-running does not duplicate customers or pets', async () => {
    await seedCustomers(supabase as never);
    await expect(seedCustomers(supabase as never)).resolves.not.toThrow();

    expect(supabase.state.customerProfiles.size).toBe(5);
    const totalPets = [...supabase.state.pets.values()].flat().length;
    expect(totalPets).toBe(8);
  });
});
