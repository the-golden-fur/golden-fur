import { describe, expect, it } from 'vitest';
import {
  applyServiceFilters,
  buildServiceFilterFields,
  deriveServiceSortKey,
  matchesServiceQuery,
  SERVICE_COMPARATORS,
  SERVICE_GROUP_BY_AXES,
} from './serviceBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { Service } from '../../maintenance.types';

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

function buildService(overrides: Partial<Service> = {}): Service {
  return {
    id: 's-1',
    category: 'Grooming',
    name: 'Bath',
    base_price: 300,
    duration_minutes: null,
    is_active: true,
    requires_assessed_pet: true,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    service_pricing_tiers: [],
    service_branch_availability: [
      { service_id: 's-1', branch_id: 'branch-makati', is_available: true },
    ],
    ...overrides,
  };
}

describe('buildServiceFilterFields', () => {
  it('builds Category, Branch, and Status fields, Status defaulting to active', () => {
    const fields = buildServiceFilterFields(BRANCHES);
    expect(fields.map((f) => f.id)).toEqual(['category', 'branch', 'status']);
    const status = fields.find((f) => f.id === 'status');
    expect(status?.defaultValue).toBe('active');
  });
});

describe('applyServiceFilters', () => {
  const services = [
    buildService({ id: '1', category: 'Grooming', is_active: true }),
    buildService({
      id: '2',
      category: 'Veterinary',
      is_active: false,
      service_branch_availability: [
        { service_id: '2', branch_id: 'branch-southwoods', is_available: true },
      ],
    }),
  ];

  it('narrows by category', () => {
    const tiles: FilterTile[] = [{ fieldId: 'category', value: 'Veterinary' }];
    expect(applyServiceFilters(services, tiles).map((s) => s.id)).toEqual([
      '2',
    ]);
  });

  it('narrows by branch availability', () => {
    const tiles: FilterTile[] = [{ fieldId: 'branch', value: 'branch-makati' }];
    expect(applyServiceFilters(services, tiles).map((s) => s.id)).toEqual([
      '1',
    ]);
  });

  it('narrows by status', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'inactive' }];
    expect(applyServiceFilters(services, tiles).map((s) => s.id)).toEqual([
      '2',
    ]);
  });
});

describe('matchesServiceQuery', () => {
  it('matches on name', () => {
    const service = buildService({ name: 'Bath' });
    expect(matchesServiceQuery(service, 'bath')).toBe(true);
    expect(matchesServiceQuery(service, 'exam')).toBe(false);
  });
});

describe('deriveServiceSortKey + SERVICE_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveServiceSortKey(null)).toBe('name-asc');
  });

  it('sorts by name A to Z', () => {
    const services = [
      buildService({ id: '1', name: 'Wellness Exam' }),
      buildService({ id: '2', name: 'Bath' }),
    ];
    expect(
      [...services].sort(SERVICE_COMPARATORS['name-asc']).map((s) => s.id)
    ).toEqual(['2', '1']);
  });
});

describe('SERVICE_GROUP_BY_AXES', () => {
  it('offers Category and Status axes', () => {
    expect(SERVICE_GROUP_BY_AXES.map((axis) => axis.id)).toEqual([
      'category',
      'status',
    ]);
  });
});
