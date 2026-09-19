import { describe, expect, it } from 'vitest';
import {
  applyStaffFilters,
  buildStaffFilterFields,
  deriveStaffSortKey,
  matchesStaffQuery,
  STAFF_COMPARATORS,
} from './staffBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { StaffProfile } from '../../staff.types';

function buildStaff(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-1',
    role: 'Groomer',
    username: 'jcruz',
    registered_email: 'jcruz@example.com',
    display_name: 'Jamie Cruz',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('buildStaffFilterFields', () => {
  const branches = [
    { id: 'branch-1', name: 'Makati', is_vet_branch: true },
    { id: 'branch-2', name: 'Southwoods', is_vet_branch: false },
  ];

  it('offers only a Role filter for a non-Superadmin viewer', () => {
    const fields = buildStaffFilterFields(branches, false);
    expect(fields.map((f) => f.id)).toEqual(['role']);
  });

  it('also offers a Branch filter for a Superadmin viewer', () => {
    const fields = buildStaffFilterFields(branches, true);
    expect(fields.map((f) => f.id)).toEqual(['role', 'branch']);
  });
});

describe('applyStaffFilters', () => {
  const staffList = [
    buildStaff({ id: '1', role: 'Groomer', branch_id: 'branch-1' }),
    buildStaff({ id: '2', role: 'Cashier', branch_id: 'branch-2' }),
  ];

  it('narrows by role', () => {
    const tiles: FilterTile[] = [{ fieldId: 'role', value: 'Cashier' }];
    expect(applyStaffFilters(staffList, tiles).map((s) => s.id)).toEqual(['2']);
  });

  it('narrows by branch', () => {
    const tiles: FilterTile[] = [{ fieldId: 'branch', value: 'branch-1' }];
    expect(applyStaffFilters(staffList, tiles).map((s) => s.id)).toEqual(['1']);
  });

  it('returns everything when there are no tiles', () => {
    expect(applyStaffFilters(staffList, []).map((s) => s.id)).toEqual([
      '1',
      '2',
    ]);
  });
});

describe('matchesStaffQuery', () => {
  it('matches on display name, username, or email', () => {
    const staff = buildStaff({
      display_name: 'Jamie Cruz',
      username: 'jcruz',
      registered_email: 'jamie@example.com',
    });
    expect(matchesStaffQuery(staff, 'jamie')).toBe(true);
    expect(matchesStaffQuery(staff, 'jcruz')).toBe(true);
    expect(matchesStaffQuery(staff, 'example.com')).toBe(true);
    expect(matchesStaffQuery(staff, 'reyes')).toBe(false);
  });
});

describe('deriveStaffSortKey + STAFF_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveStaffSortKey(null)).toBe('name-asc');
  });

  it('sorts by display name', () => {
    const staffList = [
      buildStaff({ id: '1', display_name: 'Jamie Cruz' }),
      buildStaff({ id: '2', display_name: 'Alex Reyes' }),
    ];
    expect(
      [...staffList].sort(STAFF_COMPARATORS['name-asc']).map((s) => s.id)
    ).toEqual(['2', '1']);
  });
});
