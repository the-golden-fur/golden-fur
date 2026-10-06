import type {
  Cage,
  CageOccupant,
  CageOccupantPayment,
  CageSize,
} from '../../../hotel/hotel.types';

export const CAGE_SIZE_ORDER: CageSize[] = ['S', 'M', 'L', 'XL'];

export type CageSortKey =
  | 'label'
  | 'status'
  | 'size'
  | 'checkout-soonest'
  | 'checkin-latest'
  | 'pet-name'
  | 'payment';

export const CAGE_SORT_OPTIONS: Array<{ value: CageSortKey; label: string }> = [
  { value: 'label', label: 'Sort: Label (A-Z)' },
  { value: 'status', label: 'Sort: Status' },
  { value: 'size', label: 'Sort: Size' },
  { value: 'checkout-soonest', label: 'Sort: Checkout due (soonest)' },
  { value: 'checkin-latest', label: 'Sort: Checked in (latest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
  { value: 'payment', label: 'Sort: Payment (to collect first)' },
];

/** Money still to collect first; a settled stay last. */
const PAYMENT_ORDER: CageOccupantPayment[] = [
  'unpaid',
  'partially_paid',
  'pay_at_checkout',
  'paid',
];

type CageComparator = (a: Cage, b: Cage) => number;

/**
 * The Cage Occupancy list's sorts. The last four are about the pet in the
 * cage rather than the cage itself, so they need the occupant lookup - and
 * a cage with nobody in it (or with nothing to compare, e.g. a walk-in with
 * no expected checkout) always sorts below those that have, whichever way
 * the sort runs. Only an Occupied cage has an occupant: a stale entry for a
 * cage that has since been freed is ignored, same as on its card.
 */
export function buildCageComparators(
  occupantByCageId: ReadonlyMap<string, CageOccupant>
): Record<CageSortKey, CageComparator> {
  const occupantOf = (cage: Cage) =>
    cage.status === 'Occupied' ? occupantByCageId.get(cage.id) : undefined;

  /** Compares by a value only some cages have; the ones without go last. */
  function byOccupant<Value>(
    read: (occupant: CageOccupant) => Value | null | undefined,
    compare: (a: Value, b: Value) => number
  ): CageComparator {
    return (a, b) => {
      const aOccupant = occupantOf(a);
      const bOccupant = occupantOf(b);
      const aValue = aOccupant ? read(aOccupant) : null;
      const bValue = bOccupant ? read(bOccupant) : null;

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      return compare(aValue, bValue);
    };
  }

  return {
    label: (a, b) => a.cage_label.localeCompare(b.cage_label),
    status: (a, b) => a.status.localeCompare(b.status),
    size: (a, b) =>
      CAGE_SIZE_ORDER.indexOf(a.size) - CAGE_SIZE_ORDER.indexOf(b.size),
    'checkout-soonest': byOccupant(
      (occupant) => occupant.expected_checkout_at,
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    ),
    'checkin-latest': byOccupant(
      (occupant) => occupant.since,
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    ),
    'pet-name': byOccupant(
      (occupant) => occupant.pet_name,
      (a, b) => a.localeCompare(b)
    ),
    payment: byOccupant(
      (occupant) => occupant.payment,
      (a, b) => PAYMENT_ORDER.indexOf(a) - PAYMENT_ORDER.indexOf(b)
    ),
  };
}

/**
 * The "columns by size" layout: one column per cage size, smallest first,
 * each keeping its cages in the order they were given (so the chosen sort
 * still applies inside every column). A size with no cages keeps its column.
 */
export function groupCagesBySize(
  cages: Cage[]
): Array<{ size: CageSize; cages: Cage[] }> {
  return CAGE_SIZE_ORDER.map((size) => ({
    size,
    cages: cages.filter((cage) => cage.size === size),
  }));
}
