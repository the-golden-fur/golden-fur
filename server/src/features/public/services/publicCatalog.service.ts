import { listPackages } from '../../maintenance/services/packages.service.ts';
import { listPromos } from '../../maintenance/services/promos.service.ts';
import { listServices } from '../../maintenance/services/services.service.ts';
import { listBranchesFull } from '../../branches/services/branches.service.ts';
import type { Package, Promo } from '../../maintenance/maintenance.types.ts';

export interface PublicPackageService {
  id: string;
  name: string;
  category: string;
  base_price: number;
}

export interface PublicPackage extends Package {
  branch_name: string;
  included_services: PublicPackageService[];
  /** Sum of included_services' base_price - what booking them individually
   * would cost, for comparison against bundled_price. */
  individual_total_price: number;
  /** individual_total_price - bundled_price, floored at 0 (a package is
   * never allowed to derive more expensive than buying separately, but this
   * guards display in case pricing configuration ever changes that). */
  savings: number;
}

export interface PublicPackagesPromos {
  packages: PublicPackage[];
  promos: Promo[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Read-through for the public (unauthenticated) marketing site's Packages &
 * Promos page - mirrors booking/services/catalog.service.ts's precedent of
 * wrapping maintenance's staff-only list functions server-side (service-role
 * client) rather than opening the RLS-gated packages/promos/services tables
 * to anonymous visitors. Only the active-by-default subset those functions
 * already produce is returned (packages/promos), except services are looked
 * up with includeInactive so a package's already-bundled service still
 * resolves a name even if it was deactivated after the fact (see
 * packages.service.ts's assertServicesExistAndActive comment - that's a
 * deliberate, pre-existing state this page must still be able to display,
 * not a bug to filter out here).
 */
export async function getPublicPackagesPromos(): Promise<PublicPackagesPromos> {
  const [packages, promos, branches, services] = await Promise.all([
    listPackages({}),
    listPromos({}),
    listBranchesFull(),
    listServices({ includeInactive: true }),
  ]);

  const branchNameById = new Map(
    branches.map((branch) => [branch.id, branch.name])
  );
  const serviceById = new Map(services.map((service) => [service.id, service]));

  return {
    packages: packages.map((pkg) => {
      const includedServices: PublicPackageService[] = (
        pkg.package_services ?? []
      )
        .map((link) => serviceById.get(link.service_id))
        .filter((service): service is (typeof services)[number] =>
          Boolean(service)
        )
        .map((service) => ({
          id: service.id,
          name: service.name,
          category: service.category,
          base_price: service.base_price,
        }));

      const individualTotalPrice = round2(
        includedServices.reduce(
          (total, service) => total + service.base_price,
          0
        )
      );

      return {
        ...pkg,
        branch_name: branchNameById.get(pkg.branch_id) ?? 'Unknown branch',
        included_services: includedServices,
        individual_total_price: individualTotalPrice,
        savings: round2(Math.max(individualTotalPrice - pkg.bundled_price, 0)),
      };
    }),
    promos,
  };
}
