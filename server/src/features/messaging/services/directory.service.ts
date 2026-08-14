import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { DirectoryEntry } from '../messaging.types.ts';

interface SearchDirectoryParams {
  query: string;
  excludeUserId: string;
  limit?: number;
}

/**
 * Backs the Mail compose recipient picker - reachable by any authenticated
 * user (staff or customer), unlike GET /staff (staff-only, branch-scoped)
 * or GET /customers (staff-only). Deliberately returns only id/display
 * name/role - never email, phone, or branch, since this is now readable by
 * any customer as a direct consequence of "anyone can Mail anyone."
 * Requires at least 2 characters so an empty/near-empty query can't be used
 * to dump the whole directory.
 */
export async function searchMessagingDirectory({
  query,
  excludeUserId,
  limit = 20,
}: SearchDirectoryParams): Promise<DirectoryEntry[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const [
    { data: staff, error: staffError },
    { data: customers, error: customersError },
  ] = await Promise.all([
    supabase
      .from('staff_profiles')
      .select('id, display_name, role')
      .is('archived_at', null)
      .or(`display_name.ilike.%${trimmed}%,username.ilike.%${trimmed}%`)
      .limit(limit),
    supabase
      .from('customer_profiles')
      .select('id, full_name')
      .is('archived_at', null)
      .ilike('full_name', `%${trimmed}%`)
      .limit(limit),
  ]);

  if (staffError) {
    throw Object.assign(new Error(staffError.message), { statusCode: 400 });
  }

  if (customersError) {
    throw Object.assign(new Error(customersError.message), { statusCode: 400 });
  }

  const staffEntries: DirectoryEntry[] = (staff ?? [])
    .filter((row) => row.id !== excludeUserId)
    .map((row) => ({
      id: row.id as string,
      kind: 'staff',
      displayName: row.display_name as string,
      role: row.role,
    }));

  const customerEntries: DirectoryEntry[] = (customers ?? [])
    .filter((row) => row.id !== excludeUserId)
    .map((row) => ({
      id: row.id as string,
      kind: 'customer',
      displayName: row.full_name as string,
    }));

  return [...staffEntries, ...customerEntries].slice(0, limit);
}
