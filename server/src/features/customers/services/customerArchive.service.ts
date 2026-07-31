import { supabase } from '../../../config/supabase/supabase.config.ts';
import { deleteAuthUser } from '../../../shared/auth/api/supabaseAuth.api.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type { CustomerProfile } from '../customer.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

async function getCustomerOrThrow(
  customerId: string
): Promise<CustomerProfile> {
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Customer profile not found');

  return data;
}

/**
 * Customers/pets never had a deactivate/archive concept before this - unlike
 * Products/Staff, there is no existing is_active toggle to build on, so this
 * introduces deactivate as step one of the same three-step flow (deactivate
 * -> archive -> hard-delete) the other two entities use.
 */
export async function deactivateCustomer(customerId: string): Promise<void> {
  await getCustomerOrThrow(customerId);

  const { error: customerError } = await supabase
    .from('customer_profiles')
    .update({ is_active: false })
    .eq('id', customerId);

  if (customerError) throwWithStatus(400, customerError.message);

  // Cascades to the customer's pets, mirroring pets.customer_id's own
  // on-delete-cascade intent at this soft-disable layer.
  const { error: petsError } = await supabase
    .from('pets')
    .update({ is_active: false })
    .eq('customer_id', customerId);

  if (petsError) throwWithStatus(400, petsError.message);
}

export async function activateCustomer(customerId: string): Promise<void> {
  await getCustomerOrThrow(customerId);

  const { error } = await supabase
    .from('customer_profiles')
    .update({ is_active: true })
    .eq('id', customerId);

  if (error) throwWithStatus(400, error.message);
}

export async function archiveCustomer(customerId: string): Promise<void> {
  const customer = await getCustomerOrThrow(customerId);
  assertInactiveBeforeArchive(customer.is_active, 'This customer');

  const archivedAt = new Date().toISOString();

  const { error: customerError } = await supabase
    .from('customer_profiles')
    .update({ archived_at: archivedAt })
    .eq('id', customerId);

  if (customerError) throwWithStatus(400, customerError.message);

  const { error: petsError } = await supabase
    .from('pets')
    .update({ archived_at: archivedAt })
    .eq('customer_id', customerId)
    .is('archived_at', null);

  if (petsError) throwWithStatus(400, petsError.message);
}

export async function restoreCustomer(customerId: string): Promise<void> {
  await getCustomerOrThrow(customerId);

  const { error } = await supabase
    .from('customer_profiles')
    .update({ archived_at: null })
    .eq('id', customerId);

  if (error) throwWithStatus(400, error.message);

  // Pets are NOT auto-restored with the customer - an individual pet may
  // have been archived independently for its own reason (see pet.archive.
  // service.ts), so restoring the customer shouldn't silently undo that.
}

export async function listArchivedCustomers(): Promise<CustomerProfile[]> {
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

/** Also removes the underlying Supabase auth user, since customer_profiles.
 * id *is* auth.users.id (same shape as staff_profiles). */
export async function hardDeleteCustomer(customerId: string): Promise<void> {
  const customer = await getCustomerOrThrow(customerId);
  assertArchivedBeforeHardDelete(customer.archived_at, 'This customer');

  const { error } = await supabase
    .from('customer_profiles')
    .delete()
    .eq('id', customerId);

  if (error) throwWithStatus(400, error.message);

  await deleteAuthUser(customerId);
}
