import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFoodCatalogItem,
  deleteFoodCatalogItem,
  listFoodCatalog,
  updateFoodCatalogItem,
} from './foodCatalog.service.ts';
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
    ]) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

describe('foodCatalog.service (#79 revision)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listFoodCatalog returns every catalog row', async () => {
    queueFromResults({
      data: [{ id: 'item-1', name: 'Dry kibble', price: 50, is_active: true }],
      error: null,
    });

    const items = await listFoodCatalog();
    expect(items).toHaveLength(1);
  });

  it('createFoodCatalogItem returns the created row', async () => {
    queueFromResults({
      data: { id: 'item-1', name: 'Wet food', price: 75, is_active: true },
      error: null,
    });

    const item = await createFoodCatalogItem({ name: 'Wet food', price: 75 });
    expect(item.name).toBe('Wet food');
  });

  it('createFoodCatalogItem rejects a duplicate name with a 409', async () => {
    queueFromResults({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    await expect(
      createFoodCatalogItem({ name: 'Wet food', price: 75 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('updateFoodCatalogItem can deactivate an item without deleting it', async () => {
    queueFromResults({
      data: { id: 'item-1', name: 'Wet food', price: 75, is_active: false },
      error: null,
    });

    const item = await updateFoodCatalogItem('item-1', { is_active: false });
    expect(item.is_active).toBe(false);
  });

  it('updateFoodCatalogItem 404s when the item does not exist', async () => {
    queueFromResults({ data: null, error: null });

    await expect(
      updateFoodCatalogItem('missing', { is_active: false })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deleteFoodCatalogItem rejects with 409 when still referenced by a check-in', async () => {
    queueFromResults({
      data: null,
      error: { code: '23503', message: 'foreign key violation' },
    });

    await expect(deleteFoodCatalogItem('item-1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
