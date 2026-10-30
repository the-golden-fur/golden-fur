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

// The shared grooming formula - packages now carry their 8 weight x coat
// cells too (per-item weight x coat pricing), so every package read loads it
// right after the bundle discount.
const GROOMING_PRICING_CONFIGURATION = {
  id: 'pricing-1',
  size_s_rule_type: 'multiplier',
  size_s_rule_value: 1,
  size_m_rule_type: 'multiplier',
  size_m_rule_value: 1.2,
  size_l_rule_type: 'multiplier',
  size_l_rule_value: 1.5,
  size_xl_rule_type: 'multiplier',
  size_xl_rule_value: 2,
  coat_long_rule_type: 'flat',
  coat_long_rule_value: 100,
  coat_extra_long_rule_type: 'flat',
  coat_extra_long_rule_value: 100,
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
        { data: PACKAGE_PRICING_CONFIGURATION, error: null }, // pricing configuration
        { data: GROOMING_PRICING_CONFIGURATION, error: null }
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

    // Custom change (package extras, 20261013262).
    it('saves the named extras on the package row itself', async () => {
      queueFromResults(
        {
          data: [{ id: 'service-bath' }, { id: 'service-blowdry' }],
          error: null,
        }, // active-services check
        { data: { id: 'package-1' }, error: null }, // insert package
        { data: null, error: null }, // insert package_services
        { data: null, error: null }, // insert package_branch_availability
        {
          data: { ...RAW_GOLDEN_PACKAGE, extras: ['Free bandana'] },
          error: null,
        }, // final fetch
        { data: PACKAGE_PRICING_CONFIGURATION, error: null },
        { data: GROOMING_PRICING_CONFIGURATION, error: null }
      );

      const result = await createPackage({
        requesterId: 'admin-1',
        input: {
          branch_ids: ['branch-makati'],
          name: 'Golden Package',
          service_ids: ['service-bath', 'service-blowdry'],
          extras: ['Free bandana'],
        },
      });

      expect(builders[1].insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Golden Package',
          extras: ['Free bandana'],
        })
      );
      expect(result.extras).toEqual(['Free bandana']);
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
        { data: PACKAGE_PRICING_CONFIGURATION, error: null }, // pricing configuration
        { data: GROOMING_PRICING_CONFIGURATION, error: null }
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
        { data: PACKAGE_PRICING_CONFIGURATION, error: null },
        { data: GROOMING_PRICING_CONFIGURATION, error: null }
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

  // Custom change (package fixed price, 20261030292).
  describe('fixed price', () => {
    const PRICED_PACKAGE = { ...RAW_GOLDEN_PACKAGE, fixed_price: 599 };

    it('uses fixed_price as bundled_price instead of the bundle discount, and as the grid base', async () => {
      queueFromResults(
        { data: PRICED_PACKAGE, error: null },
        { data: PACKAGE_PRICING_CONFIGURATION, error: null },
        { data: GROOMING_PRICING_CONFIGURATION, error: null }
      );

      const result = await getPackageById('package-1');

      expect(result.bundled_price).toBe(599);
      expect(
        result.pricing_tiers.find(
          (cell) => cell.weight_class === 'S' && cell.coat_type === 'SC'
        )?.price
      ).toBe(599);
    });

    it('honours a fixed price of 0 rather than falling back to the discount', async () => {
      queueFromResults(
        { data: { ...RAW_GOLDEN_PACKAGE, fixed_price: 0 }, error: null },
        { data: PACKAGE_PRICING_CONFIGURATION, error: null },
        { data: GROOMING_PRICING_CONFIGURATION, error: null }
      );

      const result = await getPackageById('package-1');

      expect(result.bundled_price).toBe(0);
    });

    it('rejects an Admin creating a fixed-price package', async () => {
      await expect(
        createPackage({
          requesterId: 'admin-1',
          requesterRole: 'Admin',
          input: {
            branch_ids: ['branch-makati'],
            name: 'Golden Package',
            service_ids: ['service-bath', 'service-blowdry'],
            fixed_price: 599,
          },
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects an Admin changing or clearing the fixed price', async () => {
      queueFromResults({
        data: { id: 'package-1', fixed_price: 599 },
        error: null,
      });

      await expect(
        updatePackage({
          requesterId: 'admin-1',
          requesterRole: 'Admin',
          packageId: 'package-1',
          updates: { fixed_price: null },
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('lets a Superadmin set it', async () => {
      queueFromResults(
        { data: { id: 'package-1', fixed_price: null }, error: null }, // lookup
        { data: null, error: null }, // update
        { data: PRICED_PACKAGE, error: null }, // final fetch
        { data: PACKAGE_PRICING_CONFIGURATION, error: null },
        { data: GROOMING_PRICING_CONFIGURATION, error: null }
      );

      const result = await updatePackage({
        requesterId: 'super-1',
        requesterRole: 'Superadmin',
        packageId: 'package-1',
        updates: { fixed_price: 599 },
      });

      expect(builders[1].update).toHaveBeenCalledWith(
        expect.objectContaining({ fixed_price: 599 })
      );
      expect(result.bundled_price).toBe(599);
    });
  });

  describe('listPackages', () => {
    it('AC-5: lists active packages filterable by branch, via the joined package_branch_availability array', async () => {
      queueFromResults(
        { data: [RAW_GOLDEN_PACKAGE], error: null },
        { data: PACKAGE_PRICING_CONFIGURATION, error: null },
        { data: GROOMING_PRICING_CONFIGURATION, error: null }
      );

      const result = await listPackages({ branchId: 'branch-makati' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Golden Package');
      expect(result[0].bundled_price).toBe(630);
    });

    it('custom change: excludes a package that is not available at the requested branch', async () => {
      queueFromResults(
        { data: [RAW_GOLDEN_PACKAGE], error: null },
        { data: PACKAGE_PRICING_CONFIGURATION, error: null },
        { data: GROOMING_PRICING_CONFIGURATION, error: null }
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
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-southwoods',
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
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-southwoods',
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
          requesterRole: 'Superadmin',
          requesterBranchId: 'branch-southwoods',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects an Admin trying to toggle a branch other than their own', async () => {
      await expect(
        setPackageBranchAvailability({
          packageId: 'package-1',
          branchId: 'branch-southwoods',
          isAvailable: true,
          requesterRole: 'Admin',
          requesterBranchId: 'branch-makati',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
