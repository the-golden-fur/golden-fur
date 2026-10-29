import { describe, expect, it } from 'vitest';
import type { UnavailabilityHistoryEntry } from '../../staff.types';
import {
  applyDayOffFilters,
  buildDayOffGroupByAxes,
  DAY_OFF_COMPARATORS,
  DEFAULT_DAY_OFF_SORT_KEY,
  deriveDayOffSortKey,
  matchesDayOffQuery,
} from './dayOffRequestFields';

function entry(
  overrides: Partial<UnavailabilityHistoryEntry>
): UnavailabilityHistoryEntry {
  return {
    id: 'block',
    staff_id: 'staff-1',
    start_time: '2026-11-10T00:00:00.000Z',
    end_time: '2026-11-10T10:00:00.000Z',
    reason: null,
    created_by: 'staff-1',
    created_at: '2026-10-01T00:00:00.000Z',
    status: 'pending',
    is_quick_action: false,
    is_full_day: true,
    reviewed_by: null,
    reviewed_at: null,
    denial_reason: null,
    requested_reviewer_id: null,
    leave_type: 'Vacation Leave',
    created_by_auto_build: false,
    reviewer_name: null,
    requested_reviewer_name: null,
    created_by_name: null,
    ...overrides,
  };
}

const VACATION = entry({ id: 'vacation', reason: 'Beach' });
const SICK = entry({
  id: 'sick',
  leave_type: 'Sick Leave',
  status: 'approved',
  is_full_day: false,
  reviewer_name: 'Sam Supervisor',
  start_time: '2026-08-03T01:00:00.000Z',
  created_at: '2026-08-01T00:00:00.000Z',
});
const REST = entry({
  id: 'rest',
  leave_type: 'Rest Day',
  status: 'approved',
  start_time: '2026-12-01T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
});

describe('dayOffRequestFields', () => {
  it('filters by status, type, reviewer and duration', () => {
    const all = [VACATION, SICK, REST];

    expect(
      applyDayOffFilters(all, [{ fieldId: 'status', value: 'approved' }]).map(
        (e) => e.id
      )
    ).toEqual(['sick', 'rest']);
    expect(
      applyDayOffFilters(all, [{ fieldId: 'type', value: 'Rest Day' }]).map(
        (e) => e.id
      )
    ).toEqual(['rest']);
    expect(
      applyDayOffFilters(all, [
        { fieldId: 'reviewer', value: 'Sam Supervisor' },
      ]).map((e) => e.id)
    ).toEqual(['sick']);
    expect(
      applyDayOffFilters(all, [
        { fieldId: 'duration', value: 'Part of a day' },
      ]).map((e) => e.id)
    ).toEqual(['sick']);
  });

  it('a freshly added date tile hides nothing', () => {
    expect(
      applyDayOffFilters(
        [VACATION, SICK, REST],
        [{ fieldId: 'date', value: { preset: 'all', from: null, to: null } }]
      )
    ).toHaveLength(3);
  });

  it('a custom date range keeps only days off inside it', () => {
    expect(
      applyDayOffFilters(
        [VACATION, SICK, REST],
        [
          {
            fieldId: 'date',
            value: { preset: 'custom', from: '2026-11-01', to: '2026-11-30' },
          },
        ]
      ).map((e) => e.id)
    ).toEqual(['vacation']);
  });

  it('sorts newest request first by default and honours a sort tile', () => {
    const all = [SICK, REST, VACATION];

    expect(
      [...all]
        .sort(DAY_OFF_COMPARATORS[DEFAULT_DAY_OFF_SORT_KEY])
        .map((e) => e.id)
    ).toEqual(['vacation', 'sick', 'rest']);

    const key = deriveDayOffSortKey({ fieldId: 'date', direction: 'asc' });
    expect(key).toBe('date-asc');
    expect([...all].sort(DAY_OFF_COMPARATORS[key!]).map((e) => e.id)).toEqual([
      'sick',
      'vacation',
      'rest',
    ]);

    expect(
      deriveDayOffSortKey({ fieldId: 'nope', direction: 'asc' })
    ).toBeNull();
  });

  it('search matches reason, type, status and reviewer', () => {
    expect(matchesDayOffQuery(VACATION, 'beach')).toBe(true);
    expect(matchesDayOffQuery(SICK, 'sick')).toBe(true);
    expect(matchesDayOffQuery(SICK, 'approved')).toBe(true);
    expect(matchesDayOffQuery(SICK, 'sam')).toBe(true);
    expect(matchesDayOffQuery(REST, 'beach')).toBe(false);
  });

  it('the status axis always offers all three statuses', () => {
    const status = buildDayOffGroupByAxes([VACATION]).find(
      (axis) => axis.id === 'status'
    );

    expect(status?.columns).toEqual([
      'Pending',
      'Approved',
      'Denied',
      'Cancelled',
    ]);
    expect(status?.columnFor(SICK)).toBe('Approved');
  });

  it('the month axis is chronological', () => {
    const month = buildDayOffGroupByAxes([REST, VACATION, SICK]).find(
      (axis) => axis.id === 'month'
    );

    expect(month?.columns).toHaveLength(3);
    expect(month?.columns[0]).toBe(month?.columnFor(SICK));
    expect(month?.columns[2]).toBe(month?.columnFor(REST));
  });
});
