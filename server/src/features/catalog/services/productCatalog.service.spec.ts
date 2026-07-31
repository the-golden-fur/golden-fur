import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveProduct,
  createProduct,
  hardDeleteProduct,
  listProducts,
  updateProduct,
} from './productCatalog.service.ts';
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
    ]) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

describe('productCatalog.service (Sprint 5 unification, #82)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listProducts returns every catalog row across categories', async () => {
    queueFromResults({
      data: [
        {
          id: 'item-1',
          name: 'Dry kibble',
          category: 'food',
          service_scope: 'hotel',
          price: 50,
          is_active: true,
        },
        {
          id: 'item-2',
          name: 'Amoxicillin',
          category: 'medication',
          service_scope: 'hotel',
          price: 120,
          is_active: true,
        },
      ],
      error: null,
    });

    const items = await listProducts();
    expect(items).toHaveLength(2);
  });

  it('createProduct returns the created row with its category/service_scope', async () => {
    queueFromResults({
      data: {
        id: 'item-3',
        name: 'Leash',
        category: 'misc_retail',
        service_scope: 'general',
        price: 250,
        is_active: true,
      },
      error: null,
    });

    const item = await createProduct({
      name: 'Leash',
      category: 'misc_retail',
      service_scope: 'general',
      price: 250,
    });

    expect(item.category).toBe('misc_retail');
    expect(item.service_scope).toBe('general');
  });

  it('createProduct rejects a duplicate (name, category) with a 409', async () => {
    queueFromResults({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    await expect(
      createProduct({
        name: 'Dry kibble',
        category: 'food',
        service_scope: 'hotel',
        price: 50,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('updateProduct can deactivate an item without deleting it', async () => {
    queueFromResults({
      data: {
        id: 'item-1',
        name: 'Dry kibble',
        category: 'food',
        service_scope: 'hotel',
        price: 50,
        is_active: false,
      },
      error: null,
    });

    const item = await updateProduct('item-1', { is_active: false });
    expect(item.is_active).toBe(false);
  });

  it('updateProduct 404s when the item does not exist', async () => {
    queueFromResults({ data: null, error: null });

    await expect(
      updateProduct('missing', { is_active: false })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('archiveProduct rejects with 403 when the item is still active', async () => {
    queueFromResults({
      data: { id: 'item-1', is_active: true, archived_at: null },
      error: null,
    });

    await expect(archiveProduct('item-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('archiveProduct sets archived_at once the item is deactivated', async () => {
    queueFromResults(
      { data: { id: 'item-1', is_active: false, archived_at: null }, error: null },
      { data: null, error: null }
    );

    await expect(archiveProduct('item-1')).resolves.toBeUndefined();
  });

  it('hardDeleteProduct rejects with 403 when the item has not been archived', async () => {
    queueFromResults({
      data: { id: 'item-1', is_active: false, archived_at: null },
      error: null,
    });

    await expect(hardDeleteProduct('item-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('hardDeleteProduct rejects with 409 when still referenced (e.g. a check-in)', async () => {
    queueFromResults(
      {
        data: {
          id: 'item-1',
          is_active: false,
          archived_at: '2026-07-31T00:00:00.000Z',
        },
        error: null,
      },
      { data: null, error: { code: '23503', message: 'still referenced' } }
    );

    await expect(hardDeleteProduct('item-1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
