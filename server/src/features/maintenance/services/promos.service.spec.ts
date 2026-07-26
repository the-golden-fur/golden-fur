import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPromo,
  getPromoById,
  listPromos,
  updatePromo,
} from './promos.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface BuilderRecord {
  [method: string]: ReturnType<typeof vi.fn>;
}

const builders: BuilderRecord[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  builders.length = 0;

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.or = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    builders.push(builder as BuilderRecord);
    return builder as never;
  });
}

const DATE_PROMO = {
  id: 'promo-1',
  name: 'Summer Grooming Deal',
  start_date: '2026-08-01',
  end_date: '2026-08-31',
  condition_note: null,
  discount_type: 'Percentage',
  value: 15,
  scope_type: 'all_services',
  branch_scope: 'both',
  is_active: true,
  promo_scope: [],
};

describe('promos.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPromo', () => {
    it('AC-1: creates a date-bounded all-services promo', async () => {
      queueFromResults(
        { data: { id: 'promo-1' }, error: null }, // insert
        { data: DATE_PROMO, error: null } // final fetch
      );

      const result = await createPromo({
        requesterId: 'admin-1',
        input: {
          name: 'Summer Grooming Deal',
          start_date: '2026-08-01',
          end_date: '2026-08-31',
          discount_type: 'Percentage',
          value: 15,
          scope_type: 'all_services',
          branch_scope: 'both',
        },
      });

      expect(result.name).toBe('Summer Grooming Deal');
      // No scope rows for 'all_services' - only promos + the final fetch.
      expect(supabase.from).not.toHaveBeenCalledWith('promo_scope');
    });

    it("AC-1: creates a 'specific' promo with scope rows", async () => {
      queueFromResults(
        { data: { id: 'promo-2' }, error: null }, // insert promo
        { data: null, error: null }, // insert scope
        {
          data: {
            ...DATE_PROMO,
            id: 'promo-2',
            scope_type: 'specific',
            promo_scope: [
              {
                promo_id: 'promo-2',
                service_id: 'service-1',
                package_id: null,
              },
            ],
          },
          error: null,
        }
      );

      const result = await createPromo({
        requesterId: 'admin-1',
        input: {
          name: 'Bath Promo',
          start_date: '2026-08-01',
          end_date: '2026-08-31',
          discount_type: 'Flat',
          value: 50,
          scope_type: 'specific',
          scope: [{ service_id: 'service-1' }],
          branch_scope: 'makati',
        },
      });

      expect(result.promo_scope).toHaveLength(1);
      expect(supabase.from).toHaveBeenCalledWith('promo_scope');
    });
  });

  describe('listPromos', () => {
    it('AC-5: the active list applies the defensive read-time expiry filter', async () => {
      queueFromResults({ data: [DATE_PROMO], error: null });

      await listPromos({});

      const builder = builders[0];
      expect(builder.eq).toHaveBeenCalledWith('is_active', true);
      expect(builder.or).toHaveBeenCalledWith(
        expect.stringContaining('end_date.is.null,end_date.gte.')
      );
    });

    it('skips both filters for the admin management view (include_inactive)', async () => {
      queueFromResults({ data: [DATE_PROMO], error: null });

      await listPromos({ includeInactive: true });

      const builder = builders[0];
      expect(builder.eq).not.toHaveBeenCalled();
      expect(builder.or).not.toHaveBeenCalled();
    });

    it("matches 'both'-scoped promos when filtering by a single branch", async () => {
      queueFromResults({ data: [DATE_PROMO], error: null });

      await listPromos({ branchScope: 'makati' });

      const builder = builders[0];
      expect(builder.in).toHaveBeenCalledWith('branch_scope', [
        'makati',
        'both',
      ]);
    });
  });

  describe('updatePromo', () => {
    it('AC-4: an Admin can manually deactivate a promo regardless of end_date', async () => {
      queueFromResults(
        { data: DATE_PROMO, error: null }, // existing
        { data: null, error: null }, // update
        { data: { ...DATE_PROMO, is_active: false }, error: null }
      );

      const result = await updatePromo({
        requesterId: 'admin-1',
        promoId: 'promo-1',
        updates: { is_active: false },
      });

      expect(result.is_active).toBe(false);
    });

    it('rejects a merged state that is both date-bounded and condition-based', async () => {
      queueFromResults({ data: DATE_PROMO, error: null });

      await expect(
        updatePromo({
          requesterId: 'admin-1',
          promoId: 'promo-1',
          updates: { condition_note: 'First booking of the month' },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects switching to 'specific' with no scope items anywhere", async () => {
      queueFromResults({ data: DATE_PROMO, error: null });

      await expect(
        updatePromo({
          requesterId: 'admin-1',
          promoId: 'promo-1',
          updates: { scope_type: 'specific' },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("clears scope rows when switching to 'all_services'", async () => {
      const specificPromo = {
        ...DATE_PROMO,
        scope_type: 'specific',
        promo_scope: [
          { promo_id: 'promo-1', service_id: 'service-1', package_id: null },
        ],
      };

      queueFromResults(
        { data: specificPromo, error: null }, // existing
        { data: null, error: null }, // update
        { data: null, error: null }, // delete scope rows
        { data: { ...DATE_PROMO, scope_type: 'all_services' }, error: null }
      );

      const result = await updatePromo({
        requesterId: 'admin-1',
        promoId: 'promo-1',
        updates: { scope_type: 'all_services' },
      });

      expect(result.scope_type).toBe('all_services');
      const deleteCalled = builders.some(
        (builder) => builder.delete.mock.calls.length > 0
      );
      expect(deleteCalled).toBe(true);
    });

    it('returns 404 for an unknown promo', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updatePromo({
          requesterId: 'admin-1',
          promoId: 'missing',
          updates: { is_active: false },
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getPromoById', () => {
    it('returns the promo with its scope rows', async () => {
      queueFromResults({ data: DATE_PROMO, error: null });

      const result = await getPromoById('promo-1');

      expect(result.id).toBe('promo-1');
    });
  });
});
