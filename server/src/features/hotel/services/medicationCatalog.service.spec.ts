import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMedicationCatalogItem,
  deleteMedicationCatalogItem,
  listMedicationCatalog,
  updateMedicationCatalogItem,
} from './medicationCatalog.service.ts';
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

describe('medicationCatalog.service (#79 revision)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listMedicationCatalog returns every catalog row', async () => {
    queueFromResults({
      data: [
        {
          id: 'item-1',
          name: 'Amoxicillin 250mg',
          price: 120,
          is_active: true,
        },
      ],
      error: null,
    });

    const items = await listMedicationCatalog();
    expect(items).toHaveLength(1);
  });

  it('createMedicationCatalogItem returns the created row', async () => {
    queueFromResults({
      data: { id: 'item-1', name: 'Rimadyl 75mg', price: 200, is_active: true },
      error: null,
    });

    const item = await createMedicationCatalogItem({
      name: 'Rimadyl 75mg',
      price: 200,
    });
    expect(item.name).toBe('Rimadyl 75mg');
  });

  it('createMedicationCatalogItem rejects a duplicate name with a 409', async () => {
    queueFromResults({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    await expect(
      createMedicationCatalogItem({ name: 'Rimadyl 75mg', price: 200 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('updateMedicationCatalogItem can change the price', async () => {
    queueFromResults({
      data: { id: 'item-1', name: 'Rimadyl 75mg', price: 220, is_active: true },
      error: null,
    });

    const item = await updateMedicationCatalogItem('item-1', { price: 220 });
    expect(item.price).toBe(220);
  });

  it('deleteMedicationCatalogItem rejects with 409 when still referenced by a check-in', async () => {
    queueFromResults({
      data: null,
      error: { code: '23503', message: 'foreign key violation' },
    });

    await expect(deleteMedicationCatalogItem('item-1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
