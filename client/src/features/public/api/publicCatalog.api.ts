import type { Package, Promo } from '../../maintenance/maintenance.types';

export interface PublicPackageService {
  id: string;
  name: string;
  category: string;
  base_price: number;
}

export interface PublicPackage extends Package {
  branch_names: string[];
  included_services: PublicPackageService[];
  individual_total_price: number;
  savings: number;
}

export interface PublicPromo extends Promo {
  branch_names: string[];
}

export interface PublicPackagesPromos {
  packages: PublicPackage[];
  promos: PublicPromo[];
}

interface PublicCatalogApiResult {
  data: PublicPackagesPromos | null;
  error: string | null;
}

// server/src/features/public/public.routes.ts mounted at the server root,
// same as maintenance.routes.ts and branches.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Failed to load packages and promos. Please try again.';
}

/**
 * No auth headers, deliberately - this hits the genuinely unauthenticated
 * `/public/packages-promos` route, reachable by a logged-out visitor on the
 * marketing site (unlike maintenance.api.ts's listPackages/listPromos,
 * which require a staff accessToken).
 */
export async function fetchPublicPackagesPromos(): Promise<PublicCatalogApiResult> {
  const response = await fetch(`${API_BASE_URL}/public/packages-promos`);

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const body = (await response
    .json()
    .catch(() => null)) as PublicPackagesPromos | null;

  if (body === null) {
    return {
      data: null,
      error: 'Failed to load packages and promos. Please try again.',
    };
  }

  return { data: body, error: null };
}
