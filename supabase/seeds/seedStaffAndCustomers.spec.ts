import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCustomerSeedPlan,
  buildStaffSeedPlan,
  seedStaffAndCustomers,
} from './seedStaffAndCustomers.ts';

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

const FORBIDDEN_TABLES = [
  'staff_unavailability_blocks',
  'pet_vaccination_records',
  'pet_medical_notes',
];

type MockOptions = {
  existingStaffEmails?: Set<string>;
  existingCustomerEmails?: Set<string>;
};

function createMockSupabase(options: MockOptions = {}) {
  const existingStaffEmails = options.existingStaffEmails ?? new Set<string>();
  const existingCustomerEmails =
    options.existingCustomerEmails ?? new Set<string>();

  const insertCalls: { table: string; payload: unknown }[] = [];
  const fromCalls: string[] = [];
  let nextUserId = 1;

  const createUser = vi.fn(async ({ email }: { email: string }) => ({
    data: { user: { id: `user-${nextUserId++}-${email}` } },
    error: null,
  }));

  const supabase = {
    from(table: string) {
      fromCalls.push(table);
      return {
        select() {
          if (table === 'branches') {
            return Promise.resolve({ data: BRANCHES, error: null });
          }

          return {
            eq(_column: string, value: string) {
              return {
                async maybeSingle() {
                  const existing =
                    table === 'staff_profiles'
                      ? existingStaffEmails.has(value)
                      : existingCustomerEmails.has(value);

                  return {
                    data: existing ? { id: 'existing-id' } : null,
                    error: null,
                  };
                },
              };
            },
          };
        },
        insert(payload: unknown) {
          insertCalls.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
    },
    auth: { admin: { createUser } },
  };

  return {
    supabase: supabase as unknown as SupabaseClient,
    insertCalls,
    fromCalls,
    createUser,
  };
}

describe('buildStaffSeedPlan', () => {
  it('creates exactly one row per staff_role, split across both branches', () => {
    const plan = buildStaffSeedPlan(BRANCHES);

    expect(plan).toHaveLength(8);
    expect(new Set(plan.map((row) => row.role)).size).toBe(8);

    const perBranch = new Map<string, number>();
    for (const row of plan) {
      perBranch.set(row.branchName, (perBranch.get(row.branchName) ?? 0) + 1);
    }
    expect(perBranch.get('Makati')).toBe(4);
    expect(perBranch.get('Southwoods')).toBe(4);
  });

  it('throws if fewer than 2 branches are provided', () => {
    expect(() => buildStaffSeedPlan([BRANCHES[0]!])).toThrow();
  });
});

describe('buildCustomerSeedPlan', () => {
  it('creates 3 customers, each with 1-2 pets, exactly one with a facebook_id', () => {
    const plan = buildCustomerSeedPlan();

    expect(plan).toHaveLength(3);
    for (const customer of plan) {
      expect(customer.pets.length).toBeGreaterThanOrEqual(1);
      expect(customer.pets.length).toBeLessThanOrEqual(2);
    }

    const withFacebookId = plan.filter((customer) => customer.facebookId);
    expect(withFacebookId).toHaveLength(1);
  });

  it('varies species/weight_class/coat_type across seeded pets', () => {
    const pets = buildCustomerSeedPlan().flatMap((customer) => customer.pets);

    expect(new Set(pets.map((pet) => pet.species)).size).toBeGreaterThan(1);
    expect(new Set(pets.map((pet) => pet.weightClass)).size).toBeGreaterThan(1);
    expect(new Set(pets.map((pet) => pet.coatType)).size).toBeGreaterThan(1);
  });
});

describe('seedStaffAndCustomers', () => {
  it('creates all 8 staff, 3 customers, and their pets on a first run', async () => {
    const { supabase, insertCalls, createUser } = createMockSupabase();

    const summary = await seedStaffAndCustomers(supabase);

    expect(summary.staffCreated).toHaveLength(8);
    expect(summary.customersCreated).toHaveLength(3);
    expect(summary.petsCreated).toBe(5);
    expect(createUser).toHaveBeenCalledTimes(11);

    const staffProfileInserts = insertCalls.filter(
      (call) => call.table === 'staff_profiles'
    );
    const customerProfileInserts = insertCalls.filter(
      (call) => call.table === 'customer_profiles'
    );
    const petInserts = insertCalls.filter((call) => call.table === 'pets');

    expect(staffProfileInserts).toHaveLength(8);
    expect(customerProfileInserts).toHaveLength(3);
    expect(petInserts).toHaveLength(3);
  });

  it('does not touch staff_unavailability_blocks, pet_vaccination_records, or pet_medical_notes', async () => {
    const { supabase, fromCalls } = createMockSupabase();

    await seedStaffAndCustomers(supabase);

    for (const forbiddenTable of FORBIDDEN_TABLES) {
      expect(fromCalls).not.toContain(forbiddenTable);
    }
  });

  it('is idempotent: re-running against already-seeded data skips every row without error or duplication', async () => {
    const staffEmails = new Set(
      buildStaffSeedPlan(BRANCHES).map((row) => row.email)
    );
    const customerEmails = new Set(
      buildCustomerSeedPlan().map((row) => row.email)
    );

    const { supabase, insertCalls, createUser } = createMockSupabase({
      existingStaffEmails: staffEmails,
      existingCustomerEmails: customerEmails,
    });

    const summary = await seedStaffAndCustomers(supabase);

    expect(summary.staffCreated).toHaveLength(0);
    expect(summary.staffSkipped).toHaveLength(8);
    expect(summary.customersCreated).toHaveLength(0);
    expect(summary.customersSkipped).toHaveLength(3);
    expect(createUser).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
  });
});
