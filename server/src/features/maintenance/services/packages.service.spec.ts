import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPackage,
  getPackageById,
  listPackages,
  setPackageBranchAvailability,
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
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.upsert = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    builders.push(builder as BuilderRecord);
    return builder as never;
  });
}

// bundle_discount_percentage 0.1 -> a 700 services sum derives to 630.
const PACKAGE_PRICING_CONFIGURATION = {
  id: 'package-pricing-1',
  bundle_discount_percentage: 0.1,
};

const RAW_GOLDEN_PACKAGE = {
  id: 'package-1',
  name: 'Golden Package',
  is_active: true,
  package_services: [
    { service_id: 'service-bath', services: { base_price: 300 } },
    { service_id: 'service-blowdry', services: { base_price: 200 } },
    { service_id: 'service-brush', services: { base_price: 200 } },
  ],
  package_branch_availability: [
    {
      package_id: 'package-1',
      branch_id: 'branch-makati',
      is_available: true,
    },
  ],
};

describe('packages.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPackage', () => {
    it('AC-1/AC-2 (Epic B #83): derives bundled_price from included services minus the configured discount', async () => {
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
        { data: null, error: null }, // insert package_branch_availability
        { data: RAW_GOLDEN_PACKAGE, error: null }, // final fetch (getPackageById)
        { data: PACKAGE_PRICING_CONFIGURATION, error: null } // pricing configuration
      );

      const result = await createPackage({
        requesterId: 'admin-1',
        input: {
          branch_ids: ['branch-makati'],
          name: 'Golden Package',
          service_ids: ['service-bath', 'service-blowdry', 'service-brush'],
        },
      });

      expect(result.bundled_price).toBe(630);
      expect(result.package_services).toEqual([
        { service_id: 'service-bath' },
        { service_id: 'service-blowdry' },
        { service_id: 'service-brush' },
      ]);
    });

    it('rejects unknown or inactive service ids with 400', async () => {
      queueFromResults({ data: [{ id: 'service-bath' }], error: null });

      await expect(
        createPackage({
          requesterId: 'admin-1',
          input: {
            branch_ids: ['branch-makati'],
            name: 'Golden Package',
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
    it('AC-3: replaces included services, deriving the new bundled_price', async () => {
      queueFromResults(
        { data: { id: 'package-1' }, error: null }, // lookup
        {
          data: [{ id: 'service-bath' }, { id: 'service-brush' }],
          error: null,
        }, // active-services check
        { data: null, error: null }, // delete old links
        { data: null, error: null }, // insert new links
        {
          data: {
            ...RAW_GOLDEN_PACKAGE,
            package_services: [
              { service_id: 'service-bath', services: { base_price: 300 } },
              { service_id: 'service-brush', services: { base_price: 200 } },
            ],
          },
          error: null,
        }, // final fetch
        { data: PACKAGE_PRICING_CONFIGURATION, error: null } // pricing configuration
      );

      const result = await updatePackage({
        requesterId: 'admin-1',
        packageId: 'package-1',
        updates: { service_ids: ['service-bath', 'service-brush'] },
      });

      expect(result.bundled_price).toBe(450); // (300 + 200) * 0.9
      expect(result.package_services).toHaveLength(2);
    });

    it('AC-3: toggles active status alone', async () => {
      queueFromResults(
        { data: { id: 'package-1' }, error: null },
        { data: null, error: null }, // update
        { data: { ...RAW_GOLDEN_PACKAGE, is_active: false }, error: null },
        { data: PACKAGE_PRICING_CONFIGURATION, error: null }
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
    it('AC-5: lists active packages filterable by branch, via the joined package_branch_availability array', async () => {
      queueFromResults(
        { data: [RAW_GOLDEN_PACKAGE], error: null },
        { data: PACKAGE_PRICING_CONFIGURATION, error: null }
      );

      const result = await listPackages({ branchId: 'branch-makati' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Golden Package');
      expect(result[0].bundled_price).toBe(630);
    });

    it('custom change: excludes a package that is not available at the requested branch', async () => {
      queueFromResults(
        { data: [RAW_GOLDEN_PACKAGE], error: null },
        { data: PACKAGE_PRICING_CONFIGURATION, error: null }
      );

      const result = await listPackages({ branchId: 'branch-southwoods' });

      expect(result).toHaveLength(0);
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

  describe('setPackageBranchAvailability', () => {
    it('toggles a single branch independently, mirroring setServiceBranchAvailability', async () => {
      queueFromResults(
        { data: { id: 'package-1' }, error: null },
        {
          data: {
            package_id: 'package-1',
            branch_id: 'branch-southwoods',
            is_available: false,
          },
          error: null,
        },
        { data: [{ is_available: true }, { is_available: false }], error: null } // all-rows read for the is_active sync
      );

      const result = await setPackageBranchAvailability({
        packageId: 'package-1',
        branchId: 'branch-southwoods',
        isAvailable: false,
      });

      expect(result.is_available).toBe(false);
      expect(result.branch_id).toBe('branch-southwoods');
    });

    it('custom change (unify active/available): syncs packages.is_active to false once every branch is unavailable', async () => {
      queueFromResults(
        { data: { id: 'package-1' }, error: null },
        {
          data: {
            package_id: 'package-1',
            branch_id: 'branch-southwoods',
            is_available: false,
          },
          error: null,
        },
        { data: [{ is_available: false }], error: null }
      );

      await setPackageBranchAvailability({
        packageId: 'package-1',
        branchId: 'branch-southwoods',
        isAvailable: false,
      });

      expect(builders[3].update).toHaveBeenCalledWith({ is_active: false });
    });

    it('returns 404 for an unknown package', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        setPackageBranchAvailability({
          packageId: 'missing',
          branchId: 'branch-southwoods',
          isAvailable: true,
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
