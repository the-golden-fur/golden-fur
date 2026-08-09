import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { ServiceType } from '../maintenance.types.ts';
import type {
  CreateServiceTypeInput,
  UpdateServiceTypeInput,
} from '../modules/validators/maintenance.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

export async function listServiceTypes(): Promise<ServiceType[]> {
  const { data, error } = await supabase
    .from('service_types')
    .select('*')
    .order('created_at');

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function createServiceType(
  input: CreateServiceTypeInput,
  requesterId: string
): Promise<ServiceType> {
  const { data, error } = await supabase
    .from('service_types')
    .insert({
      key: input.key,
      name: input.name,
      staff_picker_enabled: input.staff_picker_enabled ?? false,
      cage_picker_enabled: input.cage_picker_enabled ?? false,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(409, `A service type with key "${input.key}" already exists`);
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create service type');

  return data;
}

export async function updateServiceType(
  serviceTypeId: string,
  updates: UpdateServiceTypeInput,
  requesterId: string
): Promise<ServiceType> {
  const { data, error } = await supabase
    .from('service_types')
    .update({
      ...updates,
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', serviceTypeId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Service type not found');

  return data;
}
