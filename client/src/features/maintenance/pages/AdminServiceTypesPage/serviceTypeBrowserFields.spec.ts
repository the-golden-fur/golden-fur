import { describe, expect, it } from 'vitest';
import {
  applyServiceTypeFilters,
  buildServiceTypeFilterFields,
  deriveServiceTypeSortKey,
  matchesServiceTypeQuery,
  SERVICE_TYPE_COMPARATORS,
  SERVICE_TYPE_GROUP_BY_AXES,
} from './serviceTypeBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { ServiceType } from '../../maintenance.types';

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

function buildServiceType(overrides: Partial<ServiceType> = {}): ServiceType {
  return {
    id: 't-1',
    key: 'grooming',
    name: 'Grooming',
    is_active: true,
    staff_picker_enabled: true,
    cage_picker_enabled: false,
    eligible_staff_roles: [],
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    service_type_branch_availability: [
      {
        service_type_id: 't-1',
        branch_id: 'branch-makati',
        is_available: true,
      },
    ],
    ...overrides,
  };
}

describe('buildServiceTypeFilterFields', () => {
  it('builds a Branch field defaulting to the first branch', () => {
    const fields = buildServiceTypeFilterFields(BRANCHES);
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe('branch');
    expect(fields[0].defaultValue).toBe('branch-makati');
  });
});

describe('applyServiceTypeFilters', () => {
  it('narrows by branch availability', () => {
    const types = [
      buildServiceType({ id: '1' }),
      buildServiceType({
        id: '2',
        service_type_branch_availability: [
          {
            service_type_id: '2',
            branch_id: 'branch-southwoods',
            is_available: true,
          },
        ],
      }),
    ];
    const tiles: FilterTile[] = [{ fieldId: 'branch', value: 'branch-makati' }];
    expect(applyServiceTypeFilters(types, tiles).map((t) => t.id)).toEqual([
      '1',
    ]);
  });
});

describe('matchesServiceTypeQuery', () => {
  it('matches on name', () => {
    const type = buildServiceType({ name: 'Grooming' });
    expect(matchesServiceTypeQuery(type, 'groom')).toBe(true);
    expect(matchesServiceTypeQuery(type, 'hotel')).toBe(false);
  });
});

describe('deriveServiceTypeSortKey + SERVICE_TYPE_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveServiceTypeSortKey(null)).toBe('name-asc');
  });

  it('sorts by name A to Z', () => {
    const types = [
      buildServiceType({ id: '1', name: 'Hotel' }),
      buildServiceType({ id: '2', name: 'Grooming' }),
    ];
    expect(
      [...types].sort(SERVICE_TYPE_COMPARATORS['name-asc']).map((t) => t.id)
    ).toEqual(['2', '1']);
  });
});

describe('SERVICE_TYPE_GROUP_BY_AXES', () => {
  it('offers Staff picker and Cage picker axes', () => {
    expect(SERVICE_TYPE_GROUP_BY_AXES.map((axis) => axis.id)).toEqual([
      'staffPicker',
      'cagePicker',
    ]);
    expect(
      SERVICE_TYPE_GROUP_BY_AXES[0].columnFor(
        buildServiceType({ staff_picker_enabled: true })
      )
    ).toBe('Enabled');
  });
});
