import type { PackagePricingConfiguration } from '../maintenance.types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Client-side mirror of server/src/features/maintenance/utils/deriveBundledPrice.ts
 * (#83) - needed here too so the package form's preview can recompute live
 * as services are added/removed, with no round trip to the server. There is
 * no shared module between the client and server builds, so keep this
 * formula in sync with the server copy if it ever changes. An empty service
 * list derives to 0, not an error (#83 AC-4).
 */
export function deriveBundledPrice(
  includedServiceBasePrices: number[],
  config: PackagePricingConfiguration
): number {
  const sum = includedServiceBasePrices.reduce((total, price) => total + price, 0);

  return round2(sum * (1 - config.bundle_discount_percentage));
}
