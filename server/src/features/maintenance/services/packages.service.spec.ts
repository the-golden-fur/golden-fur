import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPackage,
  getPackageById,
  listPackages,
  updatePackage,
} from './packages.service.ts';
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

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const GOLDEN_PACKAGE = {
  id: 'package-1',
  branch_id: 'branch-makati',
  name: 'Golden Package',
  bundled_price: 600,
  is_active: true,
  package_services: [
    { service_id: 'service-bath' },
    { service_id: 'service-blowdry' },
    { service_id: 'service-brush' },
  ],
};

describe('packages.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPackage', () => {
    it('AC-1/AC-2: creates a per-branch package whose bundled price differs from the services sum', async () => {
      queueFromResults(
        {
          data: [
            { id: 'service-bath' },
            { id: 'service-blowdry' },
            { id: 'service-brush' },
          ],
          error: null,
        }, // active-services check
        { data: { id: 'package-1' }, error: null }, // insert package
        { data: null, error: null }, // insert package_services
        { data: GOLDEN_PACKAGE, error: null } // final fetch
      );

      const result = await createPackage({
        requesterId: 'admin-1',
        input: {
          branch_id: 'branch-makati',
          name: 'Golden Package',
          bundled_price: 600, // sum of included services is 700 - no tie
          service_ids: ['service-bath', 'service-blowdry', 'service-brush'],
        },
      });

      expect(result.bundled_price).toBe(600);
      expect(result.package_services).toHaveLength(3);
    });

    it('rejects unknown or inactive service ids with 400', async () => {
      queueFromResults({ data: [{ id: 'service-bath' }], error: null });

      await expect(
        createPackage({
          requesterId: 'admin-1',
          input: {
            branch_id: 'branch-makati',
            name: 'Golden Package',
            bundled_price: 600,
            service_ids: ['service-bath', 'service-ghost'],
          },
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('service-ghost'),
      });
    });
  });

  describe('updatePackage', () => {
    it('AC-3: replaces included services and edits price/status', async () => {
      queueFromResults(
        { data: { id: 'package-1' }, error: null }, // lookup
        {
          data: [{ id: 'service-bath' }, { id: 'service-brush' }],
          error: null,
        }, // active-services check
        { data: null, error: null }, // update fields
        { data: null, error: null }, // delete old links
        { data: null, error: null }, // insert new links
        {
          data: {
            ...GOLDEN_PACKAGE,
            bundled_price: 500,
            package_services: [
              { service_id: 'service-bath' },
              { service_id: 'service-brush' },
            ],
          },
          error: null,
        }
      );

      const result = await updatePackage({
        requesterId: 'admin-1',
        packageId: 'package-1',
        updates: {
          bundled_price: 500,
          service_ids: ['service-bath', 'service-brush'],
        },
      });

      expect(result.bundled_price).toBe(500);
      expect(result.package_services).toHaveLength(2);
    });

    it('AC-3: toggles active status alone', async () => {
      queueFromResults(
        { data: { id: 'package-1' }, error: null },
        { data: null, error: null }, // update
        { data: { ...GOLDEN_PACKAGE, is_active: false }, error: null }
      );

      const result = await updatePackage({
        requesterId: 'admin-1',
        packageId: 'package-1',
        updates: { is_active: false },
      });

      expect(result.is_active).toBe(false);
    });

    it('returns 404 for an unknown package', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updatePackage({
          requesterId: 'admin-1',
          packageId: 'missing',
          updates: { name: 'X' },
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listPackages', () => {
    it('AC-5: lists active packages filterable by branch', async () => {
      queueFromResults({ data: [GOLDEN_PACKAGE], error: null });

      const result = await listPackages({ branchId: 'branch-makati' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Golden Package');
    });
  });

  describe('getPackageById', () => {
    it('returns 404 when the id does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(getPackageById('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
