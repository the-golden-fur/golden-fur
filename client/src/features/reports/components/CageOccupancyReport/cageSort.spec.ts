import { describe, expect, it } from 'vitest';
import type { Cage, CageOccupant } from '../../../hotel/hotel.types';
import { buildCageComparators, groupCagesBySize } from './cageSort';

function cage(id: string, overrides: Partial<Cage> = {}): Cage {
  return {
    id,
    branch_id: 'branch-1',
    cage_label: id,
    size: 'S',
    status: 'Occupied',
    pet_types: ['Dog'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function occupant(
  cageId: string,
  overrides: Partial<CageOccupant> = {}
): CageOccupant {
  return {
    stay_id: `stay-${cageId}`,
    cage_id: cageId,
    pet_name: null,
    owner_name: null,
    service: 'Hotel',
    booking_id: 'booking-1',
    since: null,
    expected_checkout_at: null,
    overdue_fee_per_hour: null,
    overdue_grace_minutes: null,
    payment: null,
    ...overrides,
  };
}

function sortedIds(
  cages: Cage[],
  occupants: CageOccupant[],
  key: keyof ReturnType<typeof buildCageComparators>
): string[] {
  const comparators = buildCageComparators(
    new Map(occupants.map((entry) => [entry.cage_id, entry]))
  );

  return [...cages].sort(comparators[key]).map((entry) => entry.id);
}

describe('buildCageComparators', () => {
  it('checkout-soonest: the pet due out first is on top, empty cages last', () => {
    expect(
      sortedIds(
        [cage('empty', { status: 'Available' }), cage('later'), cage('sooner')],
        [
          occupant('later', { expected_checkout_at: '2026-08-05T02:00:00Z' }),
          occupant('sooner', { expected_checkout_at: '2026-08-03T02:00:00Z' }),
        ],
        'checkout-soonest'
      )
    ).toEqual(['sooner', 'later', 'empty']);
  });

  it('checkin-latest: the most recently checked-in pet is on top, empty cages last', () => {
    expect(
      sortedIds(
        [cage('empty', { status: 'Available' }), cage('old'), cage('new')],
        [
          occupant('old', { since: '2026-08-01T02:00:00Z' }),
          occupant('new', { since: '2026-08-02T02:00:00Z' }),
        ],
        'checkin-latest'
      )
    ).toEqual(['new', 'old', 'empty']);
  });

  it('pet-name: alphabetical by the pet in the cage, empty cages last', () => {
    expect(
      sortedIds(
        [cage('empty', { status: 'Available' }), cage('c1'), cage('c2')],
        [
          occupant('c1', { pet_name: 'Mochi' }),
          occupant('c2', { pet_name: 'Biscuit' }),
        ],
        'pet-name'
      )
    ).toEqual(['c2', 'c1', 'empty']);
  });

  it('payment: money still to collect comes first - unpaid, partially paid, pay at checkout, then paid', () => {
    expect(
      sortedIds(
        [
          cage('empty', { status: 'Available' }),
          cage('paid'),
          cage('checkout'),
          cage('partial'),
          cage('unpaid'),
        ],
        [
          occupant('paid', { payment: 'paid' }),
          occupant('checkout', { payment: 'pay_at_checkout' }),
          occupant('partial', { payment: 'partially_paid' }),
          occupant('unpaid', { payment: 'unpaid' }),
        ],
        'payment'
      )
    ).toEqual(['unpaid', 'partial', 'checkout', 'paid', 'empty']);
  });

  it('ignores a stale occupant entry for a cage that is no longer Occupied', () => {
    expect(
      sortedIds(
        [cage('freed', { status: 'Available' }), cage('busy')],
        [
          occupant('freed', { pet_name: 'Aaron' }),
          occupant('busy', { pet_name: 'Zed' }),
        ],
        'pet-name'
      )
    ).toEqual(['busy', 'freed']);
  });

  it('keeps the label, status and size sorts', () => {
    const cages = [
      cage('b', { size: 'L', status: 'Occupied' }),
      cage('a', { size: 'S', status: 'Available' }),
    ];

    expect(sortedIds(cages, [], 'label')).toEqual(['a', 'b']);
    expect(sortedIds(cages, [], 'status')).toEqual(['a', 'b']);
    expect(sortedIds(cages, [], 'size')).toEqual(['a', 'b']);
  });
});

describe('groupCagesBySize', () => {
  it('puts each cage in its size column, smallest first, keeping the given order inside a column', () => {
    const columns = groupCagesBySize([
      cage('l1', { size: 'L' }),
      cage('s2'),
      cage('s1'),
      cage('xl1', { size: 'XL' }),
    ]);

    expect(
      columns.map((column) => [column.size, column.cages.map((c) => c.id)])
    ).toEqual([
      ['S', ['s2', 's1']],
      ['M', []],
      ['L', ['l1']],
      ['XL', ['xl1']],
    ]);
  });
});
