import { describe, expect, it } from 'vitest';
import {
  applyProcedureFilters,
  deriveMedicationSortKey,
  deriveProcedureSortKey,
  matchesMedicationQuery,
  matchesProcedureQuery,
  MEDICATION_COMPARATORS,
  PROCEDURE_COMPARATORS,
} from './vetCatalogBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type {
  VetMedicationCatalogItem,
  VetProcedureCatalogItem,
} from '../../veterinary.types';

function buildMedication(
  overrides: Partial<VetMedicationCatalogItem> = {}
): VetMedicationCatalogItem {
  return {
    id: 'med-1',
    veterinarian_id: 'vet-1',
    name: 'Amoxicillin',
    default_dose: null,
    default_price: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function buildProcedure(
  overrides: Partial<VetProcedureCatalogItem> = {}
): VetProcedureCatalogItem {
  return {
    id: 'proc-1',
    veterinarian_id: 'vet-1',
    procedure_type: 'Lab test',
    description: 'CBC panel',
    default_price: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('matchesMedicationQuery', () => {
  it('matches on name or default dose', () => {
    const item = buildMedication({
      name: 'Amoxicillin',
      default_dose: '250mg',
    });
    expect(matchesMedicationQuery(item, 'amox')).toBe(true);
    expect(matchesMedicationQuery(item, '250mg')).toBe(true);
    expect(matchesMedicationQuery(item, 'meloxicam')).toBe(false);
  });
});

describe('deriveMedicationSortKey + MEDICATION_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveMedicationSortKey(null)).toBe('name-asc');
  });

  it('sorts by name', () => {
    const items = [
      buildMedication({ id: '1', name: 'Meloxicam' }),
      buildMedication({ id: '2', name: 'Amoxicillin' }),
    ];
    expect(
      [...items].sort(MEDICATION_COMPARATORS['name-asc']).map((i) => i.id)
    ).toEqual(['2', '1']);
  });
});

describe('matchesProcedureQuery', () => {
  it('matches on description or procedure type', () => {
    const item = buildProcedure({
      description: 'CBC panel',
      procedure_type: 'Lab test',
    });
    expect(matchesProcedureQuery(item, 'cbc')).toBe(true);
    expect(matchesProcedureQuery(item, 'lab test')).toBe(true);
    expect(matchesProcedureQuery(item, 'dental')).toBe(false);
  });
});

describe('applyProcedureFilters', () => {
  const procedures = [
    buildProcedure({ id: '1', procedure_type: 'Lab test' }),
    buildProcedure({ id: '2', procedure_type: 'Dental' }),
  ];

  it('narrows by procedure type', () => {
    const tiles: FilterTile[] = [{ fieldId: 'type', value: 'Dental' }];
    expect(applyProcedureFilters(procedures, tiles).map((p) => p.id)).toEqual([
      '2',
    ]);
  });

  it('returns everything when there are no tiles', () => {
    expect(applyProcedureFilters(procedures, []).map((p) => p.id)).toEqual([
      '1',
      '2',
    ]);
  });
});

describe('deriveProcedureSortKey + PROCEDURE_COMPARATORS', () => {
  it('defaults to description-asc', () => {
    expect(deriveProcedureSortKey(null)).toBe('description-asc');
  });

  it('sorts by description', () => {
    const items = [
      buildProcedure({ id: '1', description: 'Vaccination' }),
      buildProcedure({ id: '2', description: 'Dental cleaning' }),
    ];
    expect(
      [...items].sort(PROCEDURE_COMPARATORS['description-asc']).map((i) => i.id)
    ).toEqual(['2', '1']);
  });
});
