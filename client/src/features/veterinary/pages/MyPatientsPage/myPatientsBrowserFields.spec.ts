import { describe, expect, it } from 'vitest';
import {
  applyPatientFilters,
  buildPatientFilterFields,
  derivePatientSortKey,
  matchesPatientQuery,
  PATIENT_COMPARATORS,
  type PatientRow,
} from './myPatientsBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { PetTypeRow } from '../../../customers/customer.types';

function buildRow(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    petId: 'pet-1',
    lastVisitAt: '2026-01-01T00:00:00.000Z',
    petName: 'Buddy',
    ownerName: 'Jane Dela Cruz',
    petType: 'dog',
    ...overrides,
  };
}

describe('buildPatientFilterFields', () => {
  it('builds a Pet Type field from the given options', () => {
    const petTypes: PetTypeRow[] = [
      { id: '1', key: 'dog', name: 'Dog', is_active: true, created_at: '', updated_at: '' },
      { id: '2', key: 'cat', name: 'Cat', is_active: true, created_at: '', updated_at: '' },
    ];
    const fields = buildPatientFilterFields(petTypes);
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe('petType');
    expect(fields[0].defaultValue).toBe('dog');
  });
});

describe('applyPatientFilters', () => {
  const rows = [
    buildRow({ petId: '1', petType: 'dog' }),
    buildRow({ petId: '2', petType: 'cat' }),
  ];

  it('narrows by pet type', () => {
    const tiles: FilterTile[] = [{ fieldId: 'petType', value: 'cat' }];
    expect(applyPatientFilters(rows, tiles).map((r) => r.petId)).toEqual([
      '2',
    ]);
  });

  it('returns everything when there are no tiles', () => {
    expect(applyPatientFilters(rows, []).map((r) => r.petId)).toEqual([
      '1',
      '2',
    ]);
  });
});

describe('matchesPatientQuery', () => {
  it('matches on pet name or owner name', () => {
    const row = buildRow({ petName: 'Buddy', ownerName: 'Jane Dela Cruz' });
    expect(matchesPatientQuery(row, 'buddy')).toBe(true);
    expect(matchesPatientQuery(row, 'dela cruz')).toBe(true);
    expect(matchesPatientQuery(row, 'santos')).toBe(false);
  });
});

describe('derivePatientSortKey + PATIENT_COMPARATORS', () => {
  it('defaults to recent', () => {
    expect(derivePatientSortKey(null)).toBe('recent');
  });

  it('sorts by most recent visit', () => {
    const rows = [
      buildRow({ petId: '1', lastVisitAt: '2026-01-01T00:00:00.000Z' }),
      buildRow({ petId: '2', lastVisitAt: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(
      [...rows].sort(PATIENT_COMPARATORS.recent).map((r) => r.petId)
    ).toEqual(['2', '1']);
  });

  it('sorts by pet name', () => {
    const rows = [
      buildRow({ petId: '1', petName: 'Whiskers' }),
      buildRow({ petId: '2', petName: 'Buddy' }),
    ];
    expect(
      [...rows].sort(PATIENT_COMPARATORS['pet-name']).map((r) => r.petId)
    ).toEqual(['2', '1']);
  });
});
