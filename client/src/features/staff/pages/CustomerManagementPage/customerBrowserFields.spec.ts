import { describe, expect, it } from 'vitest';
import {
  applyCustomerFilters,
  CUSTOMER_COMPARATORS,
  deriveCustomerSortKey,
  matchesCustomerQuery,
} from './customerBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { CustomerProfile } from '../../../customers/customer.types';

function buildCustomer(
  overrides: Partial<CustomerProfile> = {}
): CustomerProfile {
  return {
    id: 'customer-1',
    full_name: 'Jane Dela Cruz',
    contact_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    account_email: 'jane@example.com',
    primary_auth_provider: 'email',
    facebook_id: null,
    is_active: true,
    archived_at: null,
    deactivated_at: null,
    anonymized_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('applyCustomerFilters', () => {
  const customers = [
    buildCustomer({ id: '1', is_active: true }),
    buildCustomer({ id: '2', is_active: false }),
  ];

  it('narrows to active-only when a status:active tile is present', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'active' }];
    expect(applyCustomerFilters(customers, tiles).map((c) => c.id)).toEqual([
      '1',
    ]);
  });

  it('narrows to inactive-only when a status:inactive tile is present', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'inactive' }];
    expect(applyCustomerFilters(customers, tiles).map((c) => c.id)).toEqual([
      '2',
    ]);
  });

  it('returns everything when there are no tiles', () => {
    expect(applyCustomerFilters(customers, []).map((c) => c.id)).toEqual([
      '1',
      '2',
    ]);
  });
});

describe('matchesCustomerQuery', () => {
  it('matches on full name or account email', () => {
    const customer = buildCustomer({
      full_name: 'Jane Dela Cruz',
      account_email: 'jane@example.com',
    });
    expect(matchesCustomerQuery(customer, 'jane')).toBe(true);
    expect(matchesCustomerQuery(customer, 'example.com')).toBe(true);
    expect(matchesCustomerQuery(customer, 'santos')).toBe(false);
  });
});

describe('deriveCustomerSortKey + CUSTOMER_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveCustomerSortKey(null)).toBe('name-asc');
  });

  it('sorts by full name', () => {
    const customers = [
      buildCustomer({ id: '1', full_name: 'Mark Santos' }),
      buildCustomer({ id: '2', full_name: 'Jane Dela Cruz' }),
    ];
    expect(
      [...customers].sort(CUSTOMER_COMPARATORS['name-asc']).map((c) => c.id)
    ).toEqual(['2', '1']);
  });
});
