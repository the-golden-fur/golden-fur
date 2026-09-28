import { describe, expect, it } from 'vitest';
import type { PromoCapConfiguration } from '../../maintenance.types';
import {
  applyCapFilters,
  CAP_COMPARATORS,
  CAP_GROUP_BY_AXES,
  deriveCapSortKey,
  describeCap,
  matchesCapQuery,
  type CapRow,
} from './promoCapBrowserFields';

function cap(
  overrides: Partial<PromoCapConfiguration> &
    Pick<PromoCapConfiguration, 'cap_type' | 'cap_value'>
): PromoCapConfiguration {
  return {
    id: 'cap-1',
    branch_id: 'branch-1',
    updated_by_staff_id: null,
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const MAKATI: CapRow = {
  branchId: 'branch-makati',
  branchName: 'Makati',
  config: cap({ cap_type: 'flat', cap_value: 150 }),
};
const SOUTHWOODS: CapRow = { branchId: 'branch-sw', branchName: 'Southwoods' };
const BGC: CapRow = {
  branchId: 'branch-bgc',
  branchName: 'BGC',
  config: cap({ cap_type: 'percentage', cap_value: 30 }),
};
const ROWS = [MAKATI, SOUTHWOODS, BGC];

describe('matchesCapQuery', () => {
  it('matches the branch name or the cap type label, case-insensitively', () => {
    expect(matchesCapQuery(MAKATI, 'maka')).toBe(true);
    expect(matchesCapQuery(MAKATI, 'flat')).toBe(true);
    expect(matchesCapQuery(SOUTHWOODS, 'no cap')).toBe(true);
    expect(matchesCapQuery(SOUTHWOODS, 'flat')).toBe(false);
  });
});

describe('applyCapFilters', () => {
  it('filters by cap type, including branches with no cap saved', () => {
    expect(
      applyCapFilters(ROWS, [{ fieldId: 'capType', value: 'flat' }])
    ).toEqual([MAKATI]);
    expect(
      applyCapFilters(ROWS, [{ fieldId: 'capType', value: 'none' }])
    ).toEqual([SOUTHWOODS]);
  });

  it('filters by cap value range; a branch with no cap never matches a bounded range', () => {
    expect(
      applyCapFilters(ROWS, [
        { fieldId: 'capValue', value: { min: 100, max: null } },
      ])
    ).toEqual([MAKATI]);
    expect(
      applyCapFilters(ROWS, [
        { fieldId: 'capValue', value: { min: null, max: 100 } },
      ])
    ).toEqual([BGC]);
    // An untouched range keeps everything.
    expect(
      applyCapFilters(ROWS, [
        { fieldId: 'capValue', value: { min: null, max: null } },
      ])
    ).toEqual(ROWS);
  });
});

describe('sorting', () => {
  it('defaults to branch A-Z and derives keys from a sort tile', () => {
    expect(deriveCapSortKey(null)).toBe('branch-asc');
    expect(deriveCapSortKey({ fieldId: 'value', direction: 'desc' })).toBe(
      'value-desc'
    );
    expect(deriveCapSortKey({ fieldId: 'nope', direction: 'asc' })).toBe(
      'branch-asc'
    );
  });

  it('sorts by branch, and by value with no-cap rows always last', () => {
    const ids = (key: keyof typeof CAP_COMPARATORS) =>
      [...ROWS].sort(CAP_COMPARATORS[key]).map((row) => row.branchId);

    expect(ids('branch-asc')).toEqual([
      'branch-bgc',
      'branch-makati',
      'branch-sw',
    ]);
    expect(ids('branch-desc')).toEqual([
      'branch-sw',
      'branch-makati',
      'branch-bgc',
    ]);
    expect(ids('value-asc')).toEqual([
      'branch-bgc',
      'branch-makati',
      'branch-sw',
    ]);
    expect(ids('value-desc')).toEqual([
      'branch-makati',
      'branch-bgc',
      'branch-sw',
    ]);
  });
});

describe('grouping and display', () => {
  it('groups by cap type, with a column for branches that have no cap', () => {
    const axis = CAP_GROUP_BY_AXES[0];

    expect(axis.columns).toContain('No cap saved');
    expect(axis.columnFor(MAKATI)).toBe('Flat');
    expect(axis.columnFor(BGC)).toBe('Percentage');
    expect(axis.columnFor(SOUTHWOODS)).toBe('No cap saved');
  });

  it('describes a saved cap with its unit', () => {
    expect(describeCap(MAKATI.config as PromoCapConfiguration)).toBe(
      'Flat - 150 PHP'
    );
    expect(describeCap(BGC.config as PromoCapConfiguration)).toBe(
      'Percentage - 30%'
    );
  });
});
