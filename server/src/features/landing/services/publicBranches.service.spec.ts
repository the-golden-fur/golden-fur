import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listPublicBranches } from './publicBranches.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

function mockTables(tables: Record<string, { data: unknown; error: unknown }>) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = tables[table];
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'order']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (resolve: (_result: unknown) => void) => resolve(result);
    return builder;
  }) as never);
}

const HOURS = { monday: { open: '08:00', close: '18:00' } };

describe('listPublicBranches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists each branch with the categories it offers, in card order', async () => {
    mockTables({
      branches: {
        data: [
          {
            id: 'b-makati',
            name: 'Makati',
            address: 'Makati City',
            contact_number: '+63 2 1',
            is_vet_branch: true,
            operating_hours: HOURS,
          },
          {
            id: 'b-imus',
            name: 'Imus',
            address: 'Imus, Cavite',
            contact_number: null,
            is_vet_branch: false,
            operating_hours: null,
          },
        ],
        error: null,
      },
      service_branch_availability: {
        data: [
          { branch_id: 'b-makati', services: { category: 'Hotel' } },
          { branch_id: 'b-makati', services: { category: 'Grooming' } },
          { branch_id: 'b-makati', services: { category: 'Grooming' } },
          { branch_id: 'b-makati', services: { category: 'Veterinary' } },
          // A Veterinary row at a non-vet branch is not offered there.
          { branch_id: 'b-imus', services: { category: 'Veterinary' } },
          { branch_id: 'b-imus', services: { category: 'Daycare' } },
        ],
        error: null,
      },
    });

    await expect(listPublicBranches()).resolves.toEqual([
      {
        id: 'b-makati',
        name: 'Makati',
        address: 'Makati City',
        contact_number: '+63 2 1',
        operating_hours: HOURS,
        categories: ['Grooming', 'Veterinary', 'Hotel'],
      },
      {
        id: 'b-imus',
        name: 'Imus',
        address: 'Imus, Cavite',
        contact_number: null,
        operating_hours: {},
        categories: ['Daycare'],
      },
    ]);
  });

  it('a branch with no available services is still listed, with no categories', async () => {
    mockTables({
      branches: {
        data: [
          {
            id: 'b-new',
            name: 'New',
            address: 'Somewhere',
            contact_number: null,
            is_vet_branch: false,
            operating_hours: HOURS,
          },
        ],
        error: null,
      },
      service_branch_availability: { data: [], error: null },
    });

    const [branch] = await listPublicBranches();
    expect(branch.categories).toEqual([]);
  });

  it('passes a query error on as a 400', async () => {
    mockTables({
      branches: { data: null, error: { message: 'boom' } },
      service_branch_availability: { data: [], error: null },
    });

    await expect(listPublicBranches()).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
