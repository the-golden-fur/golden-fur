import type { PackagePricingConfiguration } from '../maintenance.types.ts';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pure derivation (#83): (included services' base_price[],
 * package_pricing_configuration) -> bundled_price. Sum of the included
 * services' base_price, minus a configurable bundle discount percentage
 * (#82 Dev Notes). An empty service list derives to 0, not an error - the
 * client's zero-service empty state (#83 AC-4) relies on that.
 *
 * Client-side has its own copy of this exact formula (no shared module
 * between the two builds) - keep the two in sync if this changes.
 */
export function deriveBundledPrice(
  includedServiceBasePrices: number[],
  config: PackagePricingConfiguration
): number {
  const sum = includedServiceBasePrices.reduce(
    (total, price) => total + price,
    0
  );

  return round2(sum * (1 - config.bundle_discount_percentage));
}
