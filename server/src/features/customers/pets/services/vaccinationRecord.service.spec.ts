import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVaccinationRecord,
  deleteVaccinationRecord,
  listVaccinationRecords,
  updateVaccinationRecord,
} from './vaccinationRecord.service.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';

vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
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
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

describe('vaccinationRecord.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createVaccinationRecord', () => {
    it('AC-1: an authorized staff role creates a record with vaccine name and date administered', async () => {
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: { id: 'pet-1' }, error: null },
        {
          data: {
            id: 'record-1',
            pet_id: 'pet-1',
            vaccine_name: 'Rabies',
            date_administered: '2026-07-01',
            next_due_date: null,
            administered_by: 'staff-1',
            notes: null,
            created_at: '2026-07-01T00:00:00.000Z',
          },
          error: null,
        }
      );

      const result = await createVaccinationRecord({
        requesterId: 'staff-1',
        petId: 'pet-1',
        vaccineName: 'Rabies',
        dateAdministered: '2026-07-01',
      });

      expect(result.vaccine_name).toBe('Rabies');
    });

    it('rejects an unauthorized staff role with 403', async () => {
      queueFromResults({ data: { role: 'Groomer' }, error: null });

      await expect(
        createVaccinationRecord({
          requesterId: 'staff-1',
          petId: 'pet-1',
          vaccineName: 'Rabies',
          dateAdministered: '2026-07-01',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects a customer (no staff_profiles row) with 403', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        createVaccinationRecord({
          requesterId: 'customer-1',
          petId: 'pet-1',
          vaccineName: 'Rabies',
          dateAdministered: '2026-07-01',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('listVaccinationRecords', () => {
    it('AC-2: is available to the owning customer', async () => {
      queueFromResults(
        { data: { customer_id: 'customer-1' }, error: null },
        { data: [{ id: 'record-1' }], error: null }
      );

      const result = await listVaccinationRecords({
        requesterId: 'customer-1',
        petId: 'pet-1',
      });

      expect(result).toHaveLength(1);
    });

    it('AC-2: returns 403 for a different customer', async () => {
      queueFromResults({ data: { customer_id: 'customer-1' }, error: null });

      await expect(
        listVaccinationRecords({ requesterId: 'customer-2', petId: 'pet-1' })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('AC-2: is available to an authorized staff role', async () => {
      queueFromResults(
        { data: { customer_id: 'customer-1' }, error: null },
        { data: { role: 'Veterinarian' }, error: null },
        { data: [{ id: 'record-1' }], error: null }
      );

      const result = await listVaccinationRecords({
        requesterId: 'staff-1',
        petId: 'pet-1',
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('updateVaccinationRecord / deleteVaccinationRecord', () => {
    it('AC-3: PATCH is available only to authorized staff roles', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateVaccinationRecord({
          requesterId: 'customer-1',
          petId: 'pet-1',
          recordId: 'record-1',
          updates: { notes: 'updated' },
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('AC-3: DELETE is available only to authorized staff roles', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        deleteVaccinationRecord({
          requesterId: 'customer-1',
          petId: 'pet-1',
          recordId: 'record-1',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
