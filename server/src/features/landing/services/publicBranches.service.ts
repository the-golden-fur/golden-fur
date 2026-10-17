import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { OperatingHours } from '../../branches/branches.types.ts';
import type { PublicBranch, ServiceCategory } from '../landing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** The landing page's card order (Grooming, Veterinary, Day Care, Pet
 * Hotel), not the enum's. */
const CATEGORY_ORDER: ServiceCategory[] = [
  'Grooming',
  'Veterinary',
  'Daycare',
  'Hotel',
];

/**
 * The branches a visitor can go to, with the service categories each one
 * offers - so a branch added in Settings > Branches shows up on the landing
 * page on its own. GET /branches is Superadmin-only (branches.routes.ts),
 * hence this separate public read of just the visitor-facing fields.
 *
 * A category is offered when the branch has at least one active service in
 * it marked available there (service_branch_availability - the same rows
 * booking checks). Veterinary also needs is_vet_branch, matching
 * veterinaryEligibility.service.ts.
 */
export async function listPublicBranches(): Promise<PublicBranch[]> {
  const [branchesResult, availabilityResult] = await Promise.all([
    supabase
      .from('branches')
      .select(
        'id, name, address, contact_number, is_vet_branch, operating_hours'
      )
      .is('archived_at', null)
      .eq('is_active', true)
      // Oldest first, so the first (default) service tab is an established
      // branch, and a newly added one - often with nothing offered yet -
      // joins at the end rather than wherever its name sorts.
      .order('created_at', { ascending: true }),
    supabase
      .from('service_branch_availability')
      .select('branch_id, services!inner(category)')
      .eq('is_available', true)
      .eq('services.is_active', true),
  ]);

  const failed = branchesResult.error ?? availabilityResult.error;
  if (failed) throwWithStatus(400, failed.message);

  const categoriesByBranch = new Map<string, Set<ServiceCategory>>();
  for (const row of (availabilityResult.data ?? []) as unknown as Array<{
    branch_id: string;
    services: { category: ServiceCategory } | null;
  }>) {
    if (!row.services) continue;
    const set = categoriesByBranch.get(row.branch_id) ?? new Set();
    set.add(row.services.category);
    categoriesByBranch.set(row.branch_id, set);
  }

  return (
    (branchesResult.data ?? []) as Array<{
      id: string;
      name: string;
      address: string;
      contact_number: string | null;
      is_vet_branch: boolean;
      operating_hours: OperatingHours | null;
    }>
  ).map((branch) => {
    const offered = categoriesByBranch.get(branch.id) ?? new Set();

    return {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      contact_number: branch.contact_number,
      operating_hours: branch.operating_hours ?? {},
      categories: CATEGORY_ORDER.filter(
        (category) =>
          offered.has(category) &&
          (category !== 'Veterinary' || branch.is_vet_branch)
      ),
    };
  });
}
