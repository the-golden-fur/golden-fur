import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { VetServiceCatalogItem } from '../veterinary.types.ts';
import type {
  CreateServiceCatalogItemInput,
  UpdateServiceCatalogItemInput,
} from '../modules/validators/veterinary.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * The clinic's shared list of veterinary services and their usual prices,
 * suggested from when a vet lists what was done at a visit. One list for
 * every vet, same as the medication catalog (vetCatalog.service.ts) - the
 * routes' vetWrite role check is the access gate, nothing here filters by
 * requester, and created_by only records who added an entry.
 */
export async function listServiceCatalog(): Promise<VetServiceCatalogItem[]> {
  const { data, error } = await supabase
    .from('vet_service_catalog')
    .select('*')
    .order('name');

  if (error) throwWithStatus(400, error.message);
  return data ?? [];
}

export async function createServiceCatalogItem(
  veterinarianId: string,
  input: CreateServiceCatalogItemInput
): Promise<VetServiceCatalogItem> {
  const { data, error } = await supabase
    .from('vet_service_catalog')
    .insert({
      name: input.name,
      default_price: input.default_price,
      created_by: veterinarianId,
    })
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(400, 'Failed to create service catalog item');
  return data;
}

export async function updateServiceCatalogItem(
  itemId: string,
  updates: UpdateServiceCatalogItemInput
): Promise<VetServiceCatalogItem> {
  const { data, error } = await supabase
    .from('vet_service_catalog')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Service catalog item not found');
  return data;
}

export async function deleteServiceCatalogItem(itemId: string): Promise<void> {
  const { data, error } = await supabase
    .from('vet_service_catalog')
    .delete()
    .eq('id', itemId)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Service catalog item not found');
}
