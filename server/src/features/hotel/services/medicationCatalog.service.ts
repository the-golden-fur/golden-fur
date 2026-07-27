import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { MedicationCatalogItem } from '../hotel.types.ts';
import type {
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
} from '../modules/validators/hotel.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Backs the hybrid dropdown/freetext medication_name picker on the check-in
 * form (#79 revision) - mirrors foodCatalog.service.ts / breeds.service.ts's
 * admin-CRUD shape exactly.
 */
export async function listMedicationCatalog(): Promise<
  MedicationCatalogItem[]
> {
  const { data, error } = await supabase
    .from('medication_catalog')
    .select('*')
    .order('name');

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function createMedicationCatalogItem(
  input: CreateCatalogItemInput
): Promise<MedicationCatalogItem> {
  const { data, error } = await supabase
    .from('medication_catalog')
    .insert({ name: input.name, price: input.price })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(409, `A medication named "${input.name}" already exists`);
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create medication catalog item');

  return data;
}

export async function updateMedicationCatalogItem(
  itemId: string,
  updates: UpdateCatalogItemInput
): Promise<MedicationCatalogItem> {
  const { data, error } = await supabase
    .from('medication_catalog')
    .update(updates)
    .eq('id', itemId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(409, 'A medication with this name already exists');
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(404, 'Medication catalog item not found');

  return data;
}

export async function deleteMedicationCatalogItem(
  itemId: string
): Promise<void> {
  const { error } = await supabase
    .from('medication_catalog')
    .delete()
    .eq('id', itemId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This medication is still referenced by one or more check-ins and cannot be deleted - deactivate it instead'
      );
    }
    throwWithStatus(400, error.message);
  }
}
