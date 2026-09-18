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
  const customer = await getCustomerOrThrow(customerId);

  // Idempotent: a customer who self-deactivates while already deactivated
  // (e.g. deleteOrAnonymizeCustomer calling this defensively) keeps their
  // original deactivated_at rather than resetting the auto-delete clock.
  const { error: customerError } = await supabase
    .from('customer_profiles')
    .update({
      is_active: false,
      deactivated_at: customer.deactivated_at ?? new Date().toISOString(),
    })
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
  const customer = await getCustomerOrThrow(customerId);

  // Nothing to reactivate into - anonymize already scrubbed the profile.
  if (customer.anonymized_at) {
    throwWithStatus(410, 'This account has been permanently deleted');
  }

  const { error } = await supabase
    .from('customer_profiles')
    .update({ is_active: true, deactivated_at: null })
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

/**
 * Reads the system-default policy_configurations row's auto-delete day
 * count (customers aren't branch-scoped, so per-branch overrides on that
 * table are never relevant here). Used by getCustomerProfileController
 * (surfaced to the Danger tab / deactivated-notice page, since customers
 * can't read policy_configurations directly - RLS is staff-only) and by
 * the auto-delete scheduled job.
 */
const DOCUMENTED_AUTO_DELETE_DAYS_DEFAULT = 30;

export async function getCustomerAutoDeletePolicyDays(): Promise<number> {
  const { data, error } = await supabase
    .from('policy_configurations')
    .select('customer_deactivation_auto_delete_days')
    .is('branch_id', null)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  // Falls back to the documented column default only if the seeded
  // system-default row was somehow deleted out-of-band - mirrors
  // staffPicker.service.ts's DOCUMENTED_DEFAULTS precedent for the same
  // table.
  return data?.customer_deactivation_auto_delete_days ??
    DOCUMENTED_AUTO_DELETE_DAYS_DEFAULT;
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

const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

/**
 * Scrubs personal information in place instead of removing the row, for a
 * customer whose hard-delete hit a foreign-key wall (they have bookings/
 * transactions/credit history - none of those tables cascade-delete on
 * customer_profiles). Does NOT touch auth.users: deleting it would
 * cascade-delete this very row (customer_profiles.id references
 * auth.users(id) on delete cascade), and it isn't needed to block login -
 * customerLoginController looks a customer up by the email they typed,
 * which no longer matches once account_email is scrubbed below.
 */
export async function anonymizeCustomer(customerId: string): Promise<void> {
  const { error } = await supabase
    .from('customer_profiles')
    .update({
      full_name: 'Deleted Customer',
      contact_number: null,
      emergency_contact_name: null,
      emergency_contact_number: null,
      facebook_id: null,
      account_email: `deleted-${customerId}@deleted.goldenfur.internal`,
      anonymized_at: new Date().toISOString(),
    })
    .eq('id', customerId);

  if (error) throwWithStatus(400, error.message);
}

/**
 * Self-service "Delete account" and the scheduled auto-delete job's shared
 * core: gets the customer to archived (running deactivate/archive first if
 * the caller hasn't already), then attempts a real hard delete. Only a
 * foreign-key violation (23503 - the customer has booking/transaction/
 * credit history none of those tables cascade-delete) falls back to
 * anonymizing instead; any other error is a real failure and propagates.
 */
export async function deleteOrAnonymizeCustomer(
  customerId: string
): Promise<'deleted' | 'anonymized'> {
  const customer = await getCustomerOrThrow(customerId);

  if (customer.is_active) {
    await deactivateCustomer(customerId);
  }
  if (!customer.archived_at) {
    await archiveCustomer(customerId);
  }

  const { error } = await supabase
    .from('customer_profiles')
    .delete()
    .eq('id', customerId);

  if (!error) {
    await deleteAuthUser(customerId);
    return 'deleted';
  }

  if (error.code !== POSTGRES_FOREIGN_KEY_VIOLATION) {
    throwWithStatus(400, error.message);
  }

  await anonymizeCustomer(customerId);
  return 'anonymized';
}
