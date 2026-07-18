import { listServices } from '../../maintenance/services/services.service.ts';
import { listPackages } from '../../maintenance/services/packages.service.ts';
import { listPromos } from '../../maintenance/services/promos.service.ts';
import type { Package, Promo, Service } from '../../maintenance/maintenance.types.ts';
import type { ServiceCategory } from '../booking.types.ts';

export interface CatalogParams {
  branchId: string;
  category?: ServiceCategory;
}

export interface BookingCatalog {
  services: Service[];
  packages: Package[];
  promos: Promo[];
}

/**
 * Read-through for the customer-facing booking flow (#55 step 3, #58's
 * pricing summary): Epic A's `/maintenance/*` endpoints - and the
 * `services`/`packages`/`promos` RLS policies backing them
 * (`using (current_staff_role() is not null)`) - are staff-only by design,
 * at both the Express and Postgres layers, so neither a direct fetch nor a
 * direct Supabase-client read is available to a customer session. This
 * calls the same maintenance service-layer functions the staff endpoints
 * use, server-side, on the service-role client, and returns only the
 * active-by-default subset those functions already produce - no new RLS
 * policy or Epic A route change, kept entirely inside booking's own
 * supporting-infra pattern (matching #56/#59's availability/list
 * endpoints).
 */
export async function getBookingCatalog({
  branchId,
  category,
}: CatalogParams): Promise<BookingCatalog> {
  const [services, packages, promos] = await Promise.all([
    listServices({ branchId, category }),
    listPackages({ branchId }),
    listPromos({}),
  ]);

  return { services, packages, promos };
}
