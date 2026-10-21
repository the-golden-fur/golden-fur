interface BranchPricedService {
  base_price: number;
  service_branch_availability?: Array<{
    branch_id: string;
    price_override?: number | null;
    long_stay_price_override?: number | null;
  }>;
}

interface LongStayPricedService extends BranchPricedService {
  long_stay_nightly_price?: number | null;
  min_nights_for_free_package?: number | null;
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

/**
 * A Hotel service's long-stay nightly price at one branch (migration
 * 20261013260): the branch's own long_stay_price_override when a Superadmin
 * has set one, otherwise the service's long_stay_nightly_price - or null
 * when the service has no long-stay rate at all. Same shape as
 * servicePriceAtBranch above, one level down.
 */
export function longStayPriceAtBranch(
  service: LongStayPricedService,
  branchId: string
): number | null {
  const override = (service.service_branch_availability ?? []).find(
    (row) => row.branch_id === branchId
  )?.long_stay_price_override;
  const price = override ?? service.long_stay_nightly_price;

  return price == null ? null : Number(price);
}

/** A Hotel service's long-stay deal at one branch. */
export interface LongStayTerms {
  /** Nights that must be booked for the long-stay rate to apply. */
  minNights: number;
  /** Per night, once minNights are booked. */
  longStayRate: number;
  /** Per night otherwise - and for every night added after booking. */
  regularRate: number;
}

/**
 * The long-stay deal a Hotel service offers at a branch, or null when it has
 * none. The threshold is the service's min_nights_for_free_package, so the
 * cheaper nightly rate and the free package switch on together.
 *
 * Only the nights booked up front get longStayRate. Anything added afterwards
 * (a stay extension, a late checkout) is regularRate - see
 * booking/services/longStayTerms.service.ts.
 */
export function longStayTermsAtBranch(
  service: LongStayPricedService,
  branchId: string
): LongStayTerms | null {
  const minNights = service.min_nights_for_free_package;
  const longStayRate = longStayPriceAtBranch(service, branchId);

  if (!minNights || longStayRate === null) return null;

  return {
    minNights,
    longStayRate,
    regularRate: servicePriceAtBranch(service, branchId),
  };
}

/** What one booked night costs before a pet type's fixed price or the
 * Grooming matrix: the long-stay rate once enough nights are booked,
 * otherwise the branch's regular price. Stands in for base_price. */
export function nightlyPriceAtBranch(
  service: LongStayPricedService,
  branchId: string,
  nights: number
): number {
  const terms = longStayTermsAtBranch(service, branchId);

  return terms && nights >= terms.minNights
    ? terms.longStayRate
    : servicePriceAtBranch(service, branchId);
}
