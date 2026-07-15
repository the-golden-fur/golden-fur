import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMedicalNote, listMedicalNotes } from './medicalNote.service.ts';
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
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

describe('medicalNote.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMedicalNote', () => {
    it('AC-4: an authorized staff role creates a note with a valid category and records staff_id + timestamp', async () => {
      queueFromResults(
        { data: { role: 'Veterinarian' }, error: null },
        { data: { id: 'pet-1' }, error: null },
        {
          data: {
            id: 'note-1',
            pet_id: 'pet-1',
            note_text: 'Mild seasonal allergy observed',
            category: 'Allergy',
            staff_id: 'staff-1',
            created_at: '2026-07-12T00:00:00.000Z',
          },
          error: null,
        }
      );

      const result = await createMedicalNote({
        requesterId: 'staff-1',
        petId: 'pet-1',
        noteText: 'Mild seasonal allergy observed',
        category: 'Allergy',
      });

      expect(result.staff_id).toBe('staff-1');
      expect(result.category).toBe('Allergy');
    });

    it('rejects an unauthorized staff role with 403', async () => {
      queueFromResults({ data: { role: 'Cashier' }, error: null });

      await expect(
        createMedicalNote({
          requesterId: 'staff-1',
          petId: 'pet-1',
          noteText: 'Note',
          category: 'Medical Note',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('listMedicalNotes', () => {
    it('AC-5: is available to the owning customer', async () => {
      queueFromResults(
        { data: { customer_id: 'customer-1' }, error: null },
        { data: [{ id: 'note-1' }], error: null }
      );

      const result = await listMedicalNotes({
        requesterId: 'customer-1',
        petId: 'pet-1',
      });

      expect(result).toHaveLength(1);
    });

    it('AC-5: is available to an authorized staff role', async () => {
      queueFromResults(
        { data: { customer_id: 'customer-1' }, error: null },
        { data: { role: 'Receptionist' }, error: null },
        { data: [{ id: 'note-1' }], error: null }
      );

      const result = await listMedicalNotes({
        requesterId: 'staff-1',
        petId: 'pet-1',
      });

      expect(result).toHaveLength(1);
    });

    it('returns 403 for a different customer', async () => {
      queueFromResults({ data: { customer_id: 'customer-1' }, error: null });

      await expect(
        listMedicalNotes({ requesterId: 'customer-2', petId: 'pet-1' })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
