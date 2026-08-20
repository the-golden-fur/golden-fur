import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createServiceType,
  listServiceTypes,
  setServiceTypeBranchAvailability,
  updateServiceType,
} from './serviceTypes.service.ts';
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
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.upsert = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    builders.push(builder as BuilderRecord);
    return builder as never;
  });
}

describe('serviceTypes.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listServiceTypes', () => {
    it('returns every service type', async () => {
      queueFromResults({
        data: [
          { id: 'type-1', key: 'Grooming', name: 'Grooming' },
          { id: 'type-2', key: 'Hotel', name: 'Hotel' },
        ],
        error: null,
      });

      const result = await listServiceTypes();

      expect(result).toHaveLength(2);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(listServiceTypes()).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('createServiceType', () => {
    it('Custom change: creates a service type, defaulting the picker toggles to false, and seeds an available row for every branch', async () => {
      queueFromResults(
        {
          data: { id: 'type-1', key: 'Boarding', name: 'Boarding' },
          error: null,
        }, // insert
        {
          data: [{ id: 'branch-makati' }, { id: 'branch-south' }],
          error: null,
        }, // branches
        { data: null, error: null }, // availability insert
        {
          data: {
            id: 'type-1',
            key: 'Boarding',
            name: 'Boarding',
            service_type_branch_availability: [
              {
                service_type_id: 'type-1',
                branch_id: 'branch-makati',
                is_available: true,
              },
              {
                service_type_id: 'type-1',
                branch_id: 'branch-south',
                is_available: true,
              },
            ],
          },
          error: null,
        } // reload
      );

      const result = await createServiceType(
        { key: 'Boarding', name: 'Boarding' },
        'staff-1'
      );

      expect(result.id).toBe('type-1');
      expect(result.service_type_branch_availability).toHaveLength(2);
    });

    it('rejects a duplicate key with a 409', async () => {
      queueFromResults({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      await expect(
        createServiceType({ key: 'Grooming', name: 'Grooming' }, 'staff-1')
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('updateServiceType', () => {
    it('updates a service type', async () => {
      queueFromResults(
        { data: null, error: null }, // update
        {
          data: { id: 'type-1', key: 'Grooming', name: 'Grooming & Spa' },
          error: null,
        } // reload
      );

      const result = await updateServiceType(
        'type-1',
        { name: 'Grooming & Spa' },
        'staff-1'
      );

      expect(result.name).toBe('Grooming & Spa');
    });

    it('rejects an unknown service type id with a 404', async () => {
      queueFromResults(
        { data: null, error: null }, // update (no-op, no matching row)
        { data: null, error: null } // reload finds nothing
      );

      await expect(
        updateServiceType('missing-type', { name: 'X' }, 'staff-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('setServiceTypeBranchAvailability', () => {
    it('Custom change: toggles a single branch independently, mirroring setServiceBranchAvailability', async () => {
      queueFromResults(
        { data: { id: 'type-1' }, error: null }, // lookup
        {
          data: {
            service_type_id: 'type-1',
            branch_id: 'branch-south',
            is_available: false,
          },
          error: null,
        }, // upsert
        { data: [{ is_available: true }, { is_available: false }], error: null } // all-rows read for the is_active sync
      );

      const result = await setServiceTypeBranchAvailability({
        serviceTypeId: 'type-1',
        branchId: 'branch-south',
        isAvailable: false,
      });

      expect(result.is_available).toBe(false);
      expect(result.branch_id).toBe('branch-south');
    });

    it('custom change (unify active/available): syncs service_types.is_active to false once every branch is unavailable', async () => {
      queueFromResults(
        { data: { id: 'type-1' }, error: null },
        {
          data: {
            service_type_id: 'type-1',
            branch_id: 'branch-south',
            is_available: false,
          },
          error: null,
        },
        { data: [{ is_available: false }], error: null }
      );

      await setServiceTypeBranchAvailability({
        serviceTypeId: 'type-1',
        branchId: 'branch-south',
        isAvailable: false,
      });

      expect(builders[3].update).toHaveBeenCalledWith({ is_active: false });
    });

    it('returns 404 for an unknown service type', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        setServiceTypeBranchAvailability({
          serviceTypeId: 'missing-type',
          branchId: 'branch-south',
          isAvailable: false,
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
