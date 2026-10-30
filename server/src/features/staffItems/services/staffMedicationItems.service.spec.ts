import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveMedicationItem,
  createMedicationItem,
  listMineMedicationItems,
  listPickableMedicationItems,
  updateMedicationItem,
} from './staffMedicationItems.service.ts';
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

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of [
      'select',
      'eq',
      'insert',
      'update',
      'delete',
      'order',
      'is',
      'not',
      'or',
    ]) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

describe('staffMedicationItems.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listMineMedicationItems returns the caller's own non-archived rows", async () => {
    queueFromResults({
      data: [
        {
          id: 'med-1',
          owner_staff_id: 'staff-1',
          name: 'Amoxicillin',
          is_public: false,
        },
      ],
      error: null,
    });

    const items = await listMineMedicationItems('staff-1');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Amoxicillin');
  });

  it('listPickableMedicationItems labels each row with owner name and is_mine', async () => {
    queueFromResults({
      data: [
        {
          id: 'med-1',
          owner_staff_id: 'staff-1',
          name: 'Amoxicillin',
          is_public: false,
          owner: { display_name: 'Jamie Cruz' },
        },
        {
          id: 'med-2',
          owner_staff_id: 'staff-2',
          name: 'Metacam',
          is_public: true,
          owner: { display_name: 'Pat Reyes' },
        },
      ],
      error: null,
    });

    const items = await listPickableMedicationItems('staff-1');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      owner_display_name: 'Jamie Cruz',
      is_mine: true,
    });
    expect(items[1]).toMatchObject({
      owner_display_name: 'Pat Reyes',
      is_mine: false,
    });
    expect(items[0]).not.toHaveProperty('owner');
  });

  it('createMedicationItem maps a unique-violation to a 409', async () => {
    queueFromResults({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    });

    await expect(
      createMedicationItem('staff-1', {
        name: 'Amoxicillin',
        dose: '1',
        is_public: false,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('updateMedicationItem 403s when the caller does not own the item and it is private', async () => {
    queueFromResults({
      data: { owner_staff_id: 'staff-2', is_public: false },
      error: null,
    });

    await expect(
      updateMedicationItem('staff-1', 'Receptionist', 'med-1', {
        name: 'New name',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('updateMedicationItem allows an Admin to edit a public item owned by someone else', async () => {
    queueFromResults(
      { data: { owner_staff_id: 'staff-2', is_public: true }, error: null },
      {
        data: {
          id: 'med-1',
          owner_staff_id: 'staff-2',
          name: 'New name',
          is_public: true,
        },
        error: null,
      }
    );

    const item = await updateMedicationItem('staff-1', 'Superadmin', 'med-1', {
      name: 'New name',
    });
    expect(item.name).toBe('New name');
  });

  it('archiveMedicationItem sets archived_at once ownership is confirmed', async () => {
    queueFromResults(
      { data: { owner_staff_id: 'staff-1', is_public: false }, error: null },
      { data: null, error: null }
    );

    await expect(
      archiveMedicationItem('staff-1', 'Receptionist', 'med-1')
    ).resolves.toBeUndefined();
  });
});
