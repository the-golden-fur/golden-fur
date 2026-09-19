import { describe, expect, it } from 'vitest';
import {
  applyDiscountFilters,
  buildDiscountFilterFields,
  deriveDiscountSortKey,
  DISCOUNT_COMPARATORS,
  DISCOUNT_GROUP_BY_AXES,
  matchesDiscountQuery,
} from './discountBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { Discount } from '../../discounts.types';

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

function buildDiscount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'd-1',
    name: 'Senior Citizen',
    is_mandated: true,
    discount_type: 'Percentage',
    value: 20,
    scope_type: 'category',
    scope_service_id: null,
    scope_package_id: null,
    scope_category: 'Grooming',
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    archived_at: null,
    discount_branch_availability: [
      { discount_id: 'd-1', branch_id: 'branch-makati', is_available: true },
    ],
    ...overrides,
  };
}

describe('buildDiscountFilterFields', () => {
  it('builds Branch, Scope, and Status filter fields', () => {
    const fields = buildDiscountFilterFields(BRANCHES);
    expect(fields.map((f) => f.id)).toEqual(['branch', 'scopeType', 'status']);
  });
});

describe('applyDiscountFilters', () => {
  const discounts = [
    buildDiscount({ id: '1', is_active: true, scope_type: 'category' }),
    buildDiscount({
      id: '2',
      is_active: false,
      scope_type: 'service',
      discount_branch_availability: [
        {
          discount_id: '2',
          branch_id: 'branch-southwoods',
          is_available: false,
        },
      ],
    }),
  ];

  it('narrows by branch availability', () => {
    const tiles: FilterTile[] = [{ fieldId: 'branch', value: 'branch-makati' }];
    expect(applyDiscountFilters(discounts, tiles).map((d) => d.id)).toEqual([
      '1',
    ]);
  });

  it('narrows by scope type', () => {
    const tiles: FilterTile[] = [{ fieldId: 'scopeType', value: 'service' }];
    expect(applyDiscountFilters(discounts, tiles).map((d) => d.id)).toEqual([
      '2',
    ]);
  });

  it('narrows by status', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'inactive' }];
    expect(applyDiscountFilters(discounts, tiles).map((d) => d.id)).toEqual([
      '2',
    ]);
  });
});

describe('matchesDiscountQuery', () => {
  it('matches on name', () => {
    const discount = buildDiscount({ name: 'Senior Citizen' });
    expect(matchesDiscountQuery(discount, 'senior')).toBe(true);
    expect(matchesDiscountQuery(discount, 'pwd')).toBe(false);
  });
});

describe('deriveDiscountSortKey + DISCOUNT_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveDiscountSortKey(null)).toBe('name-asc');
  });

  it('sorts by value high to low', () => {
    const discounts = [
      buildDiscount({ id: '1', value: 10 }),
      buildDiscount({ id: '2', value: 50 }),
    ];
    expect(
      [...discounts].sort(DISCOUNT_COMPARATORS['value-desc']).map((d) => d.id)
    ).toEqual(['2', '1']);
  });
});

describe('DISCOUNT_GROUP_BY_AXES', () => {
  it('groups by mandated vs custom', () => {
    const axis = DISCOUNT_GROUP_BY_AXES[0];
    expect(axis.columns).toEqual(['Government-Mandated', 'Custom']);
    expect(axis.columnFor(buildDiscount({ is_mandated: true }))).toBe(
      'Government-Mandated'
    );
    expect(axis.columnFor(buildDiscount({ is_mandated: false }))).toBe(
      'Custom'
    );
  });
});
