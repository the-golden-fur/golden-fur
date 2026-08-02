import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCustomers } from './module-2-customers-pets.seed.ts';

const ASSESSOR_ID = 'staff-receptionist-1';

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

      // resolveAssessorId's lookup for the seeded Receptionist's id
      // (pet.controller.ts stamps assessed_by/assessed_at now, not the DB
      // trigger - see ...075_m02_pets_assessment_trigger_fix.sql - so this
      // seed script resolves an assessor id itself, the same way it always
      // resolved customer ids by email).
      if (table === 'staff_profiles') {
        return {
          select: () => ({
            eq: (_col: string, _role: string) => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { id: ASSESSOR_ID }, error: null }),
              }),
            }),
          }),
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

  it('creates 5 customers, each with 2-3 pets of varied pet_type/weight_class/coat_type', async () => {
    await seedCustomers(supabase as never);

    expect(supabase.state.customerProfiles.size).toBe(5);

    const allPets = [...supabase.state.pets.values()].flat() as {
      pet_type: string;
      weight_class: string | null;
      coat_type: string | null;
    }[];

    expect(allPets.length).toBe(13);
    expect(new Set(allPets.map((p) => p.pet_type)).size).toBeGreaterThan(1);
    expect(new Set(allPets.map((p) => p.weight_class)).size).toBeGreaterThan(1);
    expect(new Set(allPets.map((p) => p.coat_type)).size).toBeGreaterThan(1);
  });

  it('each customer gets at least one assessed and one unassessed pet', async () => {
    await seedCustomers(supabase as never);

    for (const pets of supabase.state.pets.values()) {
      const rows = pets as {
        weight_class: string | null;
        coat_type: string | null;
        assessed_by: string | null;
        assessed_at: string | null;
      }[];

      expect(
        rows.some((pet) => pet.weight_class !== null && pet.coat_type !== null)
      ).toBe(true);
      expect(
        rows.some((pet) => pet.weight_class === null && pet.coat_type === null)
      ).toBe(true);
    }
  });

  it('stamps assessed_by/assessed_at on assessed pets, leaves them null on unassessed ones', async () => {
    await seedCustomers(supabase as never);

    const allPets = [...supabase.state.pets.values()].flat() as {
      weight_class: string | null;
      assessed_by: string | null;
      assessed_at: string | null;
    }[];

    for (const pet of allPets) {
      if (pet.weight_class !== null) {
        expect(pet.assessed_by).toBe(ASSESSOR_ID);
        expect(pet.assessed_at).not.toBe(null);
      } else {
        expect(pet.assessed_by).toBe(null);
        expect(pet.assessed_at).toBe(null);
      }
    }
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
    expect(totalPets).toBe(13);
  });
});
