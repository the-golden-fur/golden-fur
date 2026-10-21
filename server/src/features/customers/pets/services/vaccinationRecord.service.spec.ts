import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVaccinationRecord,
  deleteVaccinationRecord,
  listPendingVaccinationRecords,
  listVaccinationRecords,
  reviewVaccinationRecord,
  updateVaccinationRecord,
} from './vaccinationRecord.service.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../../notifications/services/notification.service.ts';

const storage = {
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrls: vi.fn(),
};

vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn(() => storage) } },
}));

vi.mock('../../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedWrite {
  method: 'insert' | 'update';
  payload: Record<string, unknown>;
}

const recordedWrites: RecordedWrite[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      recordedWrites.push({ method: 'insert', payload });
      return builder;
    });
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      recordedWrites.push({ method: 'update', payload });
      return builder;
    });
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const NOT_STAFF: QueryResult = { data: null, error: null };
const OWNED_PET: QueryResult = {
  data: { id: 'pet-1', customer_id: 'customer-1' },
  error: null,
};
const CARD = {
  buffer: Buffer.from('card'),
  mimetype: 'image/jpeg',
  originalname: 'card.jpg',
  size: 1024,
};

function buildRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'record-1',
    pet_id: 'pet-1',
    vaccine_name: 'Rabies',
    date_administered: '2026-07-01',
    next_due_date: null,
    administered_by: null,
    notes: null,
    created_at: '2026-07-01T00:00:00.000Z',
    status: 'pending',
    reported_by_customer_id: 'customer-1',
    proof_path: 'pet-1/card.jpg',
    reviewed_by_staff_id: null,
    reviewed_at: null,
    rejection_reason: null,
    ...overrides,
  };
}

describe('vaccinationRecord.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
    storage.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
    storage.remove.mockResolvedValue({ data: [], error: null });
    storage.createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({
        path,
        signedUrl: `https://signed/${path}`,
        error: null,
      })),
      error: null,
    }));
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

    it("rejects a customer adding to someone else's pet with 403", async () => {
      queueFromResults(NOT_STAFF, OWNED_PET);

      await expect(
        createVaccinationRecord({
          requesterId: 'customer-2',
          petId: 'pet-1',
          vaccineName: 'Rabies',
          dateAdministered: '2026-07-01',
          proofFile: CARD,
        })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it("the pet's owner can add one - saved pending, with their card", async () => {
      queueFromResults(NOT_STAFF, OWNED_PET, {
        data: buildRecord(),
        error: null,
      });

      const result = await createVaccinationRecord({
        requesterId: 'customer-1',
        petId: 'pet-1',
        vaccineName: 'Rabies',
        dateAdministered: '2026-07-01',
        proofFile: CARD,
      });

      expect(storage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^pet-1\/.+\.jpg$/),
        CARD.buffer,
        expect.objectContaining({ contentType: 'image/jpeg' })
      );
      expect(recordedWrites[0].payload).toMatchObject({
        status: 'pending',
        reported_by_customer_id: 'customer-1',
        administered_by: null,
      });
      expect(result.proof_url).toBe('https://signed/pet-1/card.jpg');
    });

    it("an owner's record needs the card photo", async () => {
      queueFromResults(NOT_STAFF, OWNED_PET);

      await expect(
        createVaccinationRecord({
          requesterId: 'customer-1',
          petId: 'pet-1',
          vaccineName: 'Rabies',
          dateAdministered: '2026-07-01',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('an owner cannot report a vaccination dated in the future', async () => {
      queueFromResults(NOT_STAFF, OWNED_PET);

      await expect(
        createVaccinationRecord({
          requesterId: 'customer-1',
          petId: 'pet-1',
          vaccineName: 'Rabies',
          dateAdministered: '2999-01-01',
          proofFile: CARD,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('refuses a card that is not an image or PDF', async () => {
      queueFromResults(NOT_STAFF, OWNED_PET);

      await expect(
        createVaccinationRecord({
          requesterId: 'customer-1',
          petId: 'pet-1',
          vaccineName: 'Rabies',
          dateAdministered: '2026-07-01',
          proofFile: { ...CARD, mimetype: 'text/html' },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("staff records are verified straight away, as the staff member's", async () => {
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        OWNED_PET,
        { data: buildRecord({ status: 'verified', proof_path: null }), error: null }
      );

      await createVaccinationRecord({
        requesterId: 'staff-1',
        petId: 'pet-1',
        vaccineName: 'Rabies',
        dateAdministered: '2026-07-01',
      });

      expect(recordedWrites[0].payload).toMatchObject({
        status: 'verified',
        administered_by: 'staff-1',
        reviewed_by_staff_id: 'staff-1',
      });
      expect(storage.upload).not.toHaveBeenCalled();
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

  describe('owner edits and deletes', () => {
    it('an owner cannot change a record the clinic has verified', async () => {
      queueFromResults(NOT_STAFF, OWNED_PET, {
        data: buildRecord({ status: 'verified' }),
        error: null,
      });

      await expect(
        updateVaccinationRecord({
          requesterId: 'customer-1',
          petId: 'pet-1',
          recordId: 'record-1',
          updates: { notes: 'changed' },
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('fixing a rejected record sends it back for review, and swaps the card', async () => {
      queueFromResults(
        NOT_STAFF,
        OWNED_PET,
        {
          data: buildRecord({
            status: 'rejected',
            rejection_reason: 'Card unreadable',
          }),
          error: null,
        },
        { data: buildRecord(), error: null }
      );

      await updateVaccinationRecord({
        requesterId: 'customer-1',
        petId: 'pet-1',
        recordId: 'record-1',
        updates: {},
        proofFile: CARD,
      });

      expect(recordedWrites[0].payload).toMatchObject({
        status: 'pending',
        rejection_reason: null,
        reviewed_by_staff_id: null,
        proof_path: expect.stringMatching(/^pet-1\//),
      });
      // The old, rejected card is removed.
      expect(storage.remove).toHaveBeenCalledWith(['pet-1/card.jpg']);
    });

    it('an owner can delete their own pending record, card included', async () => {
      queueFromResults(
        NOT_STAFF,
        OWNED_PET,
        { data: buildRecord(), error: null },
        { data: null, error: null }
      );

      await deleteVaccinationRecord({
        requesterId: 'customer-1',
        petId: 'pet-1',
        recordId: 'record-1',
      });

      expect(storage.remove).toHaveBeenCalledWith(['pet-1/card.jpg']);
    });
  });

  describe('reviewVaccinationRecord', () => {
    it('verifies a pending record and tells the owner', async () => {
      queueFromResults(
        { data: { role: 'Front Desk' }, error: null },
        { data: buildRecord({ status: 'verified' }), error: null },
        { data: { name: 'Bantay', customer_id: 'customer-1' }, error: null }
      );

      const result = await reviewVaccinationRecord({
        requesterId: 'staff-1',
        petId: 'pet-1',
        recordId: 'record-1',
        decision: 'verify',
      });

      expect(result.status).toBe('verified');
      expect(recordedWrites[0].payload).toMatchObject({
        status: 'verified',
        rejection_reason: null,
        reviewed_by_staff_id: 'staff-1',
      });
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientCustomerId: 'customer-1',
          eventType: 'vaccination_reviewed',
          title: expect.stringContaining('verified'),
        })
      );
    });

    it('a rejection needs a reason', async () => {
      queueFromResults({ data: { role: 'Receptionist' }, error: null });

      await expect(
        reviewVaccinationRecord({
          requesterId: 'staff-1',
          petId: 'pet-1',
          recordId: 'record-1',
          decision: 'reject',
          reason: '   ',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('a record that is no longer pending answers 409', async () => {
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: null, error: null }
      );

      await expect(
        reviewVaccinationRecord({
          requesterId: 'staff-1',
          petId: 'pet-1',
          recordId: 'record-1',
          decision: 'verify',
        })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(createNotification).not.toHaveBeenCalled();
    });

    it('a customer cannot review', async () => {
      queueFromResults(NOT_STAFF);

      await expect(
        reviewVaccinationRecord({
          requesterId: 'customer-1',
          petId: 'pet-1',
          recordId: 'record-1',
          decision: 'verify',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('listPendingVaccinationRecords', () => {
    it('lists pending records with pet and owner names and card links', async () => {
      queueFromResults(
        { data: { role: 'Veterinarian' }, error: null },
        { data: [buildRecord()], error: null },
        {
          data: [{ id: 'pet-1', name: 'Bantay', customer_id: 'customer-1' }],
          error: null,
        },
        { data: [{ id: 'customer-1', full_name: 'Jane Doe' }], error: null }
      );

      const [record] = await listPendingVaccinationRecords('staff-1');

      expect(record).toMatchObject({
        pet_name: 'Bantay',
        owner_name: 'Jane Doe',
        proof_url: 'https://signed/pet-1/card.jpg',
      });
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
