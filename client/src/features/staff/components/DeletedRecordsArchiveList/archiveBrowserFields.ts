import {
  dateRangePresetLabel,
  resolveDateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import type {
  DateRangeValue,
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { ListDeletedRecordsParams } from '../../api/recordsArchive.api';

function formatDeletedRange(value: unknown): string {
  if (!value || typeof value !== 'object') return 'Any time';
  const range = value as DateRangeValue;
  if (range.preset === 'custom') {
    if (!range.from && !range.to) return 'Any time';
    return `${range.from ?? '…'} → ${range.to ?? '…'}`;
  }
  return dateRangePresetLabel(range.preset);
}

/** `tables` comes from `listDeletedRecordTables` - rebuilt whenever that list
 * changes, same as how AdminCagesPage rebuilds its pet-type filter options. */
export function buildArchiveFilterFields(tables: string[]): FilterField[] {
  const tableField: FilterField = {
    id: 'table',
    label: 'Table',
    type: 'select',
    defaultValue: tables[0] ?? '',
    options: tables.map((table) => ({ value: table, label: table })),
    formatValue: (value) =>
      typeof value === 'string' && value ? value : 'All tables',
  };

  const deletedAtField: FilterField = {
    id: 'deletedAt',
    label: 'Deleted',
    type: 'date-range',
    defaultValue: { preset: 'all', from: null, to: null },
    formatValue: formatDeletedRange,
  };

  return [tableField, deletedAtField];
}

export const ARCHIVE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'deletedAt',
    label: 'Deleted at',
    directions: [
      { value: 'desc', label: 'Newest first' },
      { value: 'asc', label: 'Oldest first' },
    ],
  },
];

/** Every filter tile on this page is already server-backed - the whole
 * point of remastering onto FilterSortBar here is that the backend already
 * accepts `table`/`from`/`to`, unlike most other pages in this rollout. */
export function deriveArchiveServerParams(
  tiles: FilterTile[]
): Pick<ListDeletedRecordsParams, 'table' | 'from' | 'to'> {
  const params: Pick<ListDeletedRecordsParams, 'table' | 'from' | 'to'> = {};

  for (const tile of tiles) {
    if (
      tile.fieldId === 'table' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      params.table = tile.value;
    }

    if (
      tile.fieldId === 'deletedAt' &&
      tile.value &&
      typeof tile.value === 'object'
    ) {
      const range = tile.value as DateRangeValue;
      const bounds =
        range.preset === 'custom'
          ? { from: range.from, to: range.to }
          : resolveDateRangePreset(range.preset);
      if (bounds.from) params.from = bounds.from;
      if (bounds.to) params.to = bounds.to;
    }
  }

  return params;
}

export function deriveArchiveSort(
  sortTile: SortTile | null
): NonNullable<ListDeletedRecordsParams['sort']> {
  return sortTile?.direction === 'asc' ? 'deleted_at_asc' : 'deleted_at_desc';
}
