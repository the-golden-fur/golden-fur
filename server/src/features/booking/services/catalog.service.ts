import { listServices } from '../../maintenance/services/services.service.ts';
import { listPackages } from '../../maintenance/services/packages.service.ts';
import { listPromos } from '../../maintenance/services/promos.service.ts';
import { getFixedPrice } from '../../maintenance/services/petTypePriceOverrides.service.ts';
import type {
  Package,
  Promo,
  Service,
} from '../../maintenance/maintenance.types.ts';
import type { ServiceCategory } from '../booking.types.ts';

export interface CatalogParams {
  branchId: string;
  category?: ServiceCategory;
  /** Pet Types admin CRUD + fixed-price override (20260912191/20260912192):
   * when given, resolves that pet type's fixed-price override for
   * branchId into `fixedPrice` below, same as booking.service.ts's own
   * getFixedPrice call at actual booking-creation time - this lets the
   * customer-facing price preview show the real charged price instead of
   * every item's own base_price/bundled_price. */
  petType?: string;
}

export interface BookingCatalog {
  services: Service[];
  packages: Package[];
  promos: Promo[];
  fixedPrice: number | null;
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
  petType,
}: CatalogParams): Promise<BookingCatalog> {
  const [services, packages, promos, fixedPrice] = await Promise.all([
    listServices({ branchId, category }),
    listPackages({ branchId }),
    listPromos({}),
    petType ? getFixedPrice(petType, branchId) : Promise.resolve(null),
  ]);

  return { services, packages, promos, fixedPrice };
}
