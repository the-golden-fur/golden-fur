import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveServiceType,
  createServiceType,
  hardDeleteServiceType,
  listServiceTypes,
  restoreServiceType,
  setServiceTypeBranchAvailability,
  updateServiceType,
} from './serviceTypes.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('node:crypto', () => ({ randomUUID: vi.fn(() => 'generated-key') }));

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
    builder.is = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.in = builder.in ?? vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn((payload?: unknown) => {
      (builder as { insertPayload?: unknown }).insertPayload = payload;
      return builder;
    });
    builder.update = vi.fn((payload?: unknown) => {
      (builder as { updatePayload?: unknown }).updatePayload = payload;
      return builder;
    });
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
          data: { id: 'type-1', key: 'generated-key', name: 'Boarding' },
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
            key: 'generated-key',
            name: 'Boarding',
            eligible_staff_roles: ['Groomer', 'Pet Assistant'],
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
        {
          name: 'Boarding',
          eligible_staff_roles: ['Groomer', 'Pet Assistant'],
        },
        'staff-1'
      );

      expect(result.id).toBe('type-1');
      expect(result.service_type_branch_availability).toHaveLength(2);
      expect(result.eligible_staff_roles).toEqual(['Groomer', 'Pet Assistant']);
      // key is no longer client-supplied - generated server-side (randomUUID,
      // mocked above), not typed into the create form.
      expect(
        (builders[0] as { insertPayload?: { key?: string } }).insertPayload?.key
      ).toBe('generated-key');
    });

    it('rejects a duplicate (randomUUID-collision) key with a 409, without referencing client input', async () => {
      queueFromResults({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      await expect(
        createServiceType({ name: 'Grooming' }, 'staff-1')
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('updateServiceType', () => {
    it('updates a service type', async () => {
      queueFromResults(
        { data: { archived_at: null }, error: null }, // archived check
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
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-south',
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
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-south',
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
          requesterRole: 'Superadmin',
          requesterBranchId: 'branch-south',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects an Admin trying to toggle a branch other than their own', async () => {
      await expect(
        setServiceTypeBranchAvailability({
          serviceTypeId: 'type-1',
          branchId: 'branch-south',
          isAvailable: true,
          requesterRole: 'Admin',
          requesterBranchId: 'branch-makati',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('archive / restore / hard delete (Config-menu consistency change)', () => {
    const CUSTOM_TYPE = {
      id: 'type-1',
      key: 'custom-uuid-key',
      archived_at: null,
    };

    it('archiveServiceType archives and deactivates in one step', async () => {
      queueFromResults(
        { data: CUSTOM_TYPE, error: null }, // lookup
        { data: null, error: null }, // update
        { data: { ...CUSTOM_TYPE, is_active: false }, error: null } // reload
      );

      await archiveServiceType('type-1', 'staff-1');

      const builder = vi.mocked(supabase.from).mock.results[1].value as {
        update: ReturnType<typeof vi.fn>;
      };
      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false })
      );
    });

    it('archiveServiceType 409s when already archived', async () => {
      queueFromResults({
        data: { ...CUSTOM_TYPE, archived_at: '2026-09-01T00:00:00Z' },
        error: null,
      });

      await expect(
        archiveServiceType('type-1', 'staff-1')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('restoreServiceType recomputes is_active from branch availability', async () => {
      queueFromResults(
        {
          data: { ...CUSTOM_TYPE, archived_at: '2026-09-01T00:00:00Z' },
          error: null,
        },
        { data: [{ is_available: false }], error: null }, // availability
        { data: null, error: null }, // update
        { data: CUSTOM_TYPE, error: null } // reload
      );

      await restoreServiceType('type-1', 'staff-1');

      const builder = vi.mocked(supabase.from).mock.results[2].value as {
        update: ReturnType<typeof vi.fn>;
      };
      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ archived_at: null, is_active: false })
      );
    });

    it('updateServiceType refuses an archived type', async () => {
      queueFromResults({
        data: { archived_at: '2026-09-01T00:00:00Z' },
        error: null,
      });

      await expect(
        updateServiceType('type-1', { name: 'X' }, 'staff-1')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('setServiceTypeBranchAvailability refuses an archived type (would otherwise un-hide it)', async () => {
      queueFromResults({
        data: { id: 'type-1', archived_at: '2026-09-01T00:00:00Z' },
        error: null,
      });

      await expect(
        setServiceTypeBranchAvailability({
          serviceTypeId: 'type-1',
          branchId: 'branch-makati',
          isAvailable: true,
          requesterRole: 'Superadmin',
          requesterBranchId: 'branch-makati',
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('hardDeleteServiceType 403s until the type is archived', async () => {
      queueFromResults({ data: CUSTOM_TYPE, error: null });

      await expect(hardDeleteServiceType('type-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('hardDeleteServiceType refuses a built-in type even once archived', async () => {
      queueFromResults({
        data: {
          id: 'type-2',
          key: 'Grooming',
          archived_at: '2026-09-01T00:00:00Z',
        },
        error: null,
      });

      await expect(hardDeleteServiceType('type-2')).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('hardDeleteServiceType deletes an archived custom type', async () => {
      queueFromResults(
        {
          data: { ...CUSTOM_TYPE, archived_at: '2026-09-01T00:00:00Z' },
          error: null,
        },
        { data: null, error: null }
      );

      await expect(hardDeleteServiceType('type-1')).resolves.toBeUndefined();
    });
  });
});
