import { describe, expect, it } from 'vitest';
import {
  buildArchiveFilterFields,
  deriveArchiveServerParams,
  deriveArchiveSort,
} from './archiveBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';

describe('buildArchiveFilterFields', () => {
  it('builds a Table select field whose default value is the first table', () => {
    const fields = buildArchiveFilterFields(['bookings', 'pets']);
    const tableField = fields.find((field) => field.id === 'table');

    expect(tableField?.defaultValue).toBe('bookings');
    expect(tableField?.type).toBe('select');
  });

  it('builds a Deleted date-range field defaulting to "all"', () => {
    const fields = buildArchiveFilterFields(['bookings']);
    const deletedField = fields.find((field) => field.id === 'deletedAt');

    expect(deletedField?.type).toBe('date-range');
    expect(deletedField?.defaultValue).toEqual({
      preset: 'all',
      from: null,
      to: null,
    });
  });
});

describe('deriveArchiveServerParams', () => {
  it('maps a table tile to the table param', () => {
    const tiles: FilterTile[] = [{ fieldId: 'table', value: 'pets' }];
    expect(deriveArchiveServerParams(tiles)).toEqual({ table: 'pets' });
  });

  it('resolves a custom date-range tile to from/to', () => {
    const tiles: FilterTile[] = [
      {
        fieldId: 'deletedAt',
        value: { preset: 'custom', from: '2026-09-01', to: '2026-09-14' },
      },
    ];
    expect(deriveArchiveServerParams(tiles)).toEqual({
      from: '2026-09-01',
      to: '2026-09-14',
    });
  });

  it('ignores an empty table value', () => {
    expect(
      deriveArchiveServerParams([{ fieldId: 'table', value: '' }])
    ).toEqual({});
  });
});

describe('deriveArchiveSort', () => {
  it('defaults to newest-first when no sort tile is set', () => {
    expect(deriveArchiveSort(null)).toBe('deleted_at_desc');
  });

  it('maps a desc/asc sort tile to the API sort enum', () => {
    expect(deriveArchiveSort({ fieldId: 'deletedAt', direction: 'asc' })).toBe(
      'deleted_at_asc'
    );
    expect(deriveArchiveSort({ fieldId: 'deletedAt', direction: 'desc' })).toBe(
      'deleted_at_desc'
    );
  });
});
