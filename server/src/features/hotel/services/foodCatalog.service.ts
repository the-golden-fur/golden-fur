import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { FoodCatalogItem } from '../hotel.types.ts';
import type {
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
} from '../modules/validators/hotel.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Postgres unique_violation / foreign_key_violation. */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Backs the hybrid dropdown/freetext food_type picker on the check-in form
 * (#79 revision) - mirrors breeds.service.ts's admin-CRUD shape exactly.
 * Open SELECT RLS (any authenticated user), Admin/Superadmin-only write.
 */
export async function listFoodCatalog(): Promise<FoodCatalogItem[]> {
  const { data, error } = await supabase
    .from('food_catalog')
    .select('*')
    .order('name');

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function createFoodCatalogItem(
  input: CreateCatalogItemInput
): Promise<FoodCatalogItem> {
  const { data, error } = await supabase
    .from('food_catalog')
    .insert({ name: input.name, price: input.price })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(409, `A food item named "${input.name}" already exists`);
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create food catalog item');

  return data;
}

export async function updateFoodCatalogItem(
  itemId: string,
  updates: UpdateCatalogItemInput
): Promise<FoodCatalogItem> {
  const { data, error } = await supabase
    .from('food_catalog')
    .update(updates)
    .eq('id', itemId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(409, 'A food item with this name already exists');
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(404, 'Food catalog item not found');

  return data;
}

export async function deleteFoodCatalogItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('food_catalog')
    .delete()
    .eq('id', itemId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This food item is still referenced by one or more check-ins and cannot be deleted - deactivate it instead'
      );
    }
    throwWithStatus(400, error.message);
  }
}
