interface BranchPricedService {
  base_price: number;
  service_branch_availability?: Array<{
    branch_id: string;
    price_override?: number | null;
  }>;
}

/**
 * What a service costs at one branch: that branch's own price
 * (service_branch_availability.price_override, migration 20261006245) when
 * a Superadmin has set one, otherwise the service's base_price. Services are
 * one shared row across branches, so this is the only place a branch can
 * differ on price - e.g. Hotel at ₱850 a night in Makati and ₱500 in
 * Southwoods.
 *
 * It replaces base_price only. A price worked out some other way is left
 * alone: a pet type's fixed price, the Grooming size/coat matrix, and
 * Daycare's hourly fees.
 */
export function servicePriceAtBranch(
  service: BranchPricedService,
  branchId: string
): number {
  const override = (service.service_branch_availability ?? []).find(
    (row) => row.branch_id === branchId
  )?.price_override;

  return Number(override ?? service.base_price);
}
