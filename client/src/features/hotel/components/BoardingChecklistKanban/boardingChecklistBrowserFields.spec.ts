import { describe, expect, it } from 'vitest';
import type { CareLogEntry } from '../../hotel.types';
import {
  ALL_DATES_FROM,
  applyChecklistFilters,
  CHECKLIST_COMPARATORS,
  CHECKLIST_GROUP_BY_AXES,
  deriveChecklistServerParams,
  deriveChecklistSortKey,
  matchesChecklistQuery,
  type Row,
} from './boardingChecklistBrowserFields';

function buildRow(
  entryOverrides: Partial<CareLogEntry> = {},
  petName = 'Max'
): Row {
  return {
    petName,
    entry: {
      id: 'entry-1',
      stay_id: 'stay-1',
      care_type: 'Feeding',
      scheduled_date: '2026-08-09',
      description: 'Morning meal — 1 cup kibble',
      time_block: 'Morning',
      status: 'Pending',
      completed_at: null,
      completed_by: null,
      created_at: '',
      stays: { stay_type: 'Hotel', pet_id: 'pet-1' },
      ...entryOverrides,
    },
  };
}

describe('boardingChecklistBrowserFields', () => {
  it('matches search text against the pet name or the task description', () => {
    const row = buildRow();
    expect(matchesChecklistQuery(row, 'max')).toBe(true);
    expect(matchesChecklistQuery(row, 'kibble')).toBe(true);
    expect(matchesChecklistQuery(row, 'luna')).toBe(false);
  });

  it('applies multi-select and pet tiles, and ignores empty ones', () => {
    const rows = [
      buildRow({ id: 'a', status: 'Pending', time_block: null }),
      buildRow({ id: 'b', status: 'Completed', care_type: 'Walking' }),
      buildRow({ id: 'c' }, 'Luna'),
    ];

    const ids = (result: Row[]) => result.map((row) => row.entry.id);

    expect(
      ids(applyChecklistFilters(rows, [{ fieldId: 'status', value: [] }]))
    ).toEqual(['a', 'b', 'c']);
    expect(
      ids(
        applyChecklistFilters(rows, [
          { fieldId: 'status', value: ['Completed'] },
        ])
      )
    ).toEqual(['b']);
    expect(
      ids(
        applyChecklistFilters(rows, [
          { fieldId: 'time', value: ['Unscheduled'] },
        ])
      )
    ).toEqual(['a']);
    expect(
      ids(applyChecklistFilters(rows, [{ fieldId: 'pet', value: 'Luna' }]))
    ).toEqual(['c']);
  });

  it('defaults to soonest-first and sorts by date, then time of day', () => {
    expect(deriveChecklistSortKey(null)).toBe('scheduled-asc');
    expect(deriveChecklistSortKey({ fieldId: 'pet', direction: 'desc' })).toBe(
      'pet-desc'
    );

    const rows = [
      buildRow({ id: 'evening', time_block: 'Evening' }),
      buildRow({ id: 'tomorrow', scheduled_date: '2026-08-10' }),
      buildRow({ id: 'morning', time_block: 'Morning' }),
    ];
    expect(
      [...rows]
        .sort(CHECKLIST_COMPARATORS['scheduled-asc'])
        .map((row) => row.entry.id)
    ).toEqual(['morning', 'evening', 'tomorrow']);
  });

  it('maps the Date tile to server params, sending an explicit lower bound for "all dates"', () => {
    expect(deriveChecklistServerParams([])).toEqual({
      dateFrom: ALL_DATES_FROM,
    });
    expect(
      deriveChecklistServerParams([
        { fieldId: 'date', value: { preset: 'all', from: null, to: null } },
      ])
    ).toEqual({ dateFrom: ALL_DATES_FROM });
    expect(
      deriveChecklistServerParams([
        {
          fieldId: 'date',
          value: { preset: 'custom', from: '2026-08-01', to: '2026-08-05' },
        },
      ])
    ).toEqual({ dateFrom: '2026-08-01', dateTo: '2026-08-05' });
  });

  it('group-by axes bucket a task by status, time of day, or category', () => {
    const row = buildRow({ time_block: null, care_type: 'Medication' });
    const columnFor = (id: string) =>
      CHECKLIST_GROUP_BY_AXES.find((axis) => axis.id === id)!.columnFor(row);

    expect(columnFor('status')).toBe('Pending');
    expect(columnFor('time')).toBe('Unscheduled');
    expect(columnFor('category')).toBe('Medication');
  });
});
