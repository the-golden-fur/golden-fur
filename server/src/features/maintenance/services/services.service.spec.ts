import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createService,
  getServiceById,
  listServices,
  setServiceBranchAvailability,
  updateService,
} from './services.service.ts';
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
    builder.or = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.upsert = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const GROOMING_SERVICE = {
  id: 'service-1',
  category: 'Grooming',
  name: 'Bath',
  base_price: 300,
  is_active: true,
  service_pricing_tiers: [{ weight_class: 'S', coat_type: 'SC', price: 300 }],
  service_branch_availability: [
    { service_id: 'service-1', branch_id: 'branch-makati', is_available: true },
    { service_id: 'service-1', branch_id: 'branch-south', is_available: false },
  ],
};

describe('services.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createService', () => {
    it('AC-1: creates a Grooming service with tiers and both-branch availability in one call', async () => {
      queueFromResults(
        { data: { id: 'service-1' }, error: null }, // insert service
        { data: null, error: null }, // insert tiers
        {
          data: [{ id: 'branch-makati' }, { id: 'branch-south' }],
          error: null,
        }, // branches
        { data: null, error: null }, // insert availability
        { data: GROOMING_SERVICE, error: null } // final fetch
      );

      const result = await createService({
        requesterId: 'admin-1',
        input: {
          name: 'Bath',
          category: 'Grooming',
          base_price: 300,
          pricing_tiers: [{ weight_class: 'S', coat_type: 'SC', price: 300 }],
        },
      });

      expect(result.id).toBe('service-1');
      expect(supabase.from).toHaveBeenCalledWith('service_pricing_tiers');
      expect(supabase.from).toHaveBeenCalledWith('service_branch_availability');
    });

    it('surfaces an insert failure as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(
        createService({
          requesterId: 'admin-1',
          input: { name: 'Bath', category: 'Grooming', base_price: 300 },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('updateService', () => {
    it('AC-2: upserts individual pricing tiers without the full set', async () => {
      queueFromResults(
        { data: { id: 'service-1', category: 'Grooming' }, error: null },
        { data: null, error: null }, // tier upsert
        { data: GROOMING_SERVICE, error: null }
      );

      const result = await updateService({
        requesterId: 'admin-1',
        serviceId: 'service-1',
        updates: {
          pricing_tiers: [{ weight_class: 'M', coat_type: 'LC', price: 450 }],
        },
      });

      expect(result.id).toBe('service-1');
    });

    it('rejects a tier upsert for a non-Grooming service with 400 (#40 Dev Notes)', async () => {
      queueFromResults({
        data: { id: 'service-2', category: 'Veterinary' },
        error: null,
      });

      await expect(
        updateService({
          requesterId: 'admin-1',
          serviceId: 'service-2',
          updates: {
            pricing_tiers: [{ weight_class: 'S', coat_type: 'SC', price: 100 }],
          },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-3: soft-deletes via is_active = false (no hard DELETE path exists)', async () => {
      queueFromResults(
        { data: { id: 'service-1', category: 'Grooming' }, error: null },
        { data: null, error: null }, // update
        {
          data: { ...GROOMING_SERVICE, is_active: false },
          error: null,
        }
      );

      const result = await updateService({
        requesterId: 'admin-1',
        serviceId: 'service-1',
        updates: { is_active: false },
      });

      expect(result.is_active).toBe(false);
    });

    it('returns 404 for an unknown service', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateService({
          requesterId: 'admin-1',
          serviceId: 'missing',
          updates: { name: 'X' },
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listServices', () => {
    it('AC-3: filters to active services by default', async () => {
      queueFromResults({ data: [GROOMING_SERVICE], error: null });

      const result = await listServices({});

      expect(result).toHaveLength(1);
    });

    it('filters by branch availability when branchId is provided', async () => {
      queueFromResults({ data: [GROOMING_SERVICE], error: null });

      const atMakati = await listServices({ branchId: 'branch-makati' });
      expect(atMakati).toHaveLength(1);

      queueFromResults({ data: [GROOMING_SERVICE], error: null });

      const atSouth = await listServices({ branchId: 'branch-south' });
      expect(atSouth).toHaveLength(0);
    });
  });

  describe('getServiceById', () => {
    it('AC-3: an inactive service remains queryable by id', async () => {
      queueFromResults({
        data: { ...GROOMING_SERVICE, is_active: false },
        error: null,
      });

      const result = await getServiceById('service-1');

      expect(result.is_active).toBe(false);
    });

    it('returns 404 when the id does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(getServiceById('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('setServiceBranchAvailability', () => {
    it('AC-4: toggles a single branch independently', async () => {
      queueFromResults(
        { data: { id: 'service-1' }, error: null },
        {
          data: {
            service_id: 'service-1',
            branch_id: 'branch-south',
            is_available: false,
          },
          error: null,
        }
      );

      const result = await setServiceBranchAvailability({
        serviceId: 'service-1',
        branchId: 'branch-south',
        isAvailable: false,
      });

      expect(result.is_available).toBe(false);
      expect(result.branch_id).toBe('branch-south');
    });

    it('returns 404 for an unknown service', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        setServiceBranchAvailability({
          serviceId: 'missing',
          branchId: 'branch-south',
          isAvailable: true,
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
