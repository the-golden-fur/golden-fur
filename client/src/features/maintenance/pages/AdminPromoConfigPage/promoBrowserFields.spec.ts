import { describe, expect, it } from 'vitest';
import {
  applyPromoFilters,
  buildPromoFilterFields,
  derivePromoSortKey,
  matchesPromoQuery,
  PROMO_COMPARATORS,
} from './promoBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { Promo } from '../../maintenance.types';

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

function buildPromo(overrides: Partial<Promo> = {}): Promo {
  return {
    id: 'p-1',
    name: 'Summer Sale',
    promo_type: 'date_range',
    start_date: '2020-01-01',
    end_date: '2099-12-31',
    days_of_week: null,
    condition_note: null,
    discount_type: 'Percentage',
    value: 15,
    scope_type: 'all_services',
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    promo_scope: [],
    promo_branch_availability: [
      { promo_id: 'p-1', branch_id: 'branch-makati', is_available: true },
    ],
    ...overrides,
  };
}

describe('buildPromoFilterFields', () => {
  it('builds Branch, Timing, and Status fields', () => {
    const fields = buildPromoFilterFields(BRANCHES);
    expect(fields.map((f) => f.id)).toEqual(['branch', 'timing', 'status']);
  });

  it('Status defaults to active (the page has always defaulted to active-only)', () => {
    const fields = buildPromoFilterFields(BRANCHES);
    const status = fields.find((f) => f.id === 'status');
    expect(status?.defaultValue).toBe('active');
  });
});

describe('applyPromoFilters', () => {
  it('narrows by branch availability', () => {
    const promos = [
      buildPromo({ id: '1' }),
      buildPromo({
        id: '2',
        promo_branch_availability: [
          { promo_id: '2', branch_id: 'branch-southwoods', is_available: true },
        ],
      }),
    ];
    const tiles: FilterTile[] = [{ fieldId: 'branch', value: 'branch-makati' }];
    expect(applyPromoFilters(promos, tiles).map((p) => p.id)).toEqual(['1']);
  });

  it('narrows by status', () => {
    const promos = [
      buildPromo({ id: '1', is_active: true }),
      buildPromo({ id: '2', is_active: false }),
    ];
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'inactive' }];
    expect(applyPromoFilters(promos, tiles).map((p) => p.id)).toEqual(['2']);
  });
});

describe('matchesPromoQuery', () => {
  it('matches on name', () => {
    const promo = buildPromo({ name: 'Summer Sale' });
    expect(matchesPromoQuery(promo, 'summer')).toBe(true);
    expect(matchesPromoQuery(promo, 'winter')).toBe(false);
  });
});

describe('derivePromoSortKey + PROMO_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(derivePromoSortKey(null)).toBe('name-asc');
  });

  it('sorts by value high to low', () => {
    const promos = [
      buildPromo({ id: '1', value: 10 }),
      buildPromo({ id: '2', value: 50 }),
    ];
    expect(
      [...promos].sort(PROMO_COMPARATORS['value-desc']).map((p) => p.id)
    ).toEqual(['2', '1']);
  });
});
