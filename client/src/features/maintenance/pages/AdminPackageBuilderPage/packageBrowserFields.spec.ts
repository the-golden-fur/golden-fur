import { describe, expect, it } from 'vitest';
import {
  applyPackageFilters,
  buildPackageFilterFields,
  derivePackageSortKey,
  matchesPackageQuery,
  PACKAGE_COMPARATORS,
  PACKAGE_GROUP_BY_AXES,
} from './packageBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { Package } from '../../maintenance.types';

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

function buildPackage(overrides: Partial<Package> = {}): Package {
  return {
    id: 'p-1',
    name: 'Golden Package',
    bundled_price: 650,
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    use_pricing_matrix: false,
    package_services: [],
    package_branch_availability: [
      { package_id: 'p-1', branch_id: 'branch-makati', is_available: true },
    ],
    ...overrides,
  };
}

describe('buildPackageFilterFields', () => {
  it('builds Branch and Status fields, Status defaulting to active', () => {
    const fields = buildPackageFilterFields(BRANCHES);
    expect(fields.map((f) => f.id)).toEqual(['branch', 'status']);
    expect(fields.find((f) => f.id === 'status')?.defaultValue).toBe(
      'active'
    );
  });
});

describe('applyPackageFilters', () => {
  const packages = [
    buildPackage({ id: '1', is_active: true }),
    buildPackage({
      id: '2',
      is_active: false,
      package_branch_availability: [
        { package_id: '2', branch_id: 'branch-southwoods', is_available: true },
      ],
    }),
  ];

  it('narrows by branch availability', () => {
    const tiles: FilterTile[] = [{ fieldId: 'branch', value: 'branch-makati' }];
    expect(applyPackageFilters(packages, tiles).map((p) => p.id)).toEqual([
      '1',
    ]);
  });

  it('narrows by status', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'inactive' }];
    expect(applyPackageFilters(packages, tiles).map((p) => p.id)).toEqual([
      '2',
    ]);
  });
});

describe('matchesPackageQuery', () => {
  it('matches on name', () => {
    const pkg = buildPackage({ name: 'Golden Package' });
    expect(matchesPackageQuery(pkg, 'golden')).toBe(true);
    expect(matchesPackageQuery(pkg, 'silver')).toBe(false);
  });
});

describe('derivePackageSortKey + PACKAGE_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(derivePackageSortKey(null)).toBe('name-asc');
  });

  it('sorts by price high to low', () => {
    const packages = [
      buildPackage({ id: '1', bundled_price: 100 }),
      buildPackage({ id: '2', bundled_price: 900 }),
    ];
    expect(
      [...packages].sort(PACKAGE_COMPARATORS['price-desc']).map((p) => p.id)
    ).toEqual(['2', '1']);
  });
});

describe('PACKAGE_GROUP_BY_AXES', () => {
  it('offers Status and Pricing axes, not Branch (multi-valued)', () => {
    expect(PACKAGE_GROUP_BY_AXES.map((axis) => axis.id)).toEqual([
      'status',
      'pricing',
    ]);
  });
});
