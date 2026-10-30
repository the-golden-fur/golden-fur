import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveFoodItem,
  createFoodItem,
  listMineFoodItems,
  listPickableFoodItems,
  updateFoodItem,
} from './staffFoodItems.service.ts';
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

describe('staffFoodItems.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listMineFoodItems returns the caller's own non-archived rows", async () => {
    queueFromResults({
      data: [
        {
          id: 'food-1',
          owner_staff_id: 'staff-1',
          name: 'Kibble',
          is_public: false,
        },
      ],
      error: null,
    });

    const items = await listMineFoodItems('staff-1');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Kibble');
  });

  it('listPickableFoodItems labels each row with owner name and is_mine', async () => {
    queueFromResults({
      data: [
        {
          id: 'food-1',
          owner_staff_id: 'staff-1',
          name: 'Kibble',
          is_public: false,
          owner: { display_name: 'Jamie Cruz' },
        },
        {
          id: 'food-2',
          owner_staff_id: 'staff-2',
          name: 'Salmon oil',
          is_public: true,
          owner: { display_name: 'Pat Reyes' },
        },
      ],
      error: null,
    });

    const items = await listPickableFoodItems('staff-1');
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

  it('createFoodItem maps a unique-violation to a 409', async () => {
    queueFromResults({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    });

    await expect(
      createFoodItem('staff-1', {
        name: 'Kibble',
        quantity: '1',
        is_public: false,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('updateFoodItem 403s when the caller does not own the item and it is private', async () => {
    queueFromResults({
      data: { owner_staff_id: 'staff-2', is_public: false },
      error: null,
    });

    await expect(
      updateFoodItem('staff-1', 'Receptionist', 'food-1', { name: 'New name' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('updateFoodItem allows an Admin to edit a public item owned by someone else', async () => {
    queueFromResults(
      { data: { owner_staff_id: 'staff-2', is_public: true }, error: null },
      {
        data: {
          id: 'food-1',
          owner_staff_id: 'staff-2',
          name: 'New name',
          is_public: true,
        },
        error: null,
      }
    );

    const item = await updateFoodItem('staff-1', 'Admin', 'food-1', {
      name: 'New name',
    });
    expect(item.name).toBe('New name');
  });

  it("updateFoodItem 403s an Admin trying to edit someone else's private item", async () => {
    queueFromResults({
      data: { owner_staff_id: 'staff-2', is_public: false },
      error: null,
    });

    await expect(
      updateFoodItem('staff-1', 'Admin', 'food-1', { name: 'New name' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('archiveFoodItem sets archived_at once ownership is confirmed', async () => {
    queueFromResults(
      { data: { owner_staff_id: 'staff-1', is_public: false }, error: null },
      { data: null, error: null }
    );

    await expect(
      archiveFoodItem('staff-1', 'Receptionist', 'food-1')
    ).resolves.toBeUndefined();
  });
});
