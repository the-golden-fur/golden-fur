import { describe, expect, it } from 'vitest';
import {
  activityLogDateKey,
  applyActivityLogFilters,
  deriveActivityLogServerParams,
  deriveActivityLogSortKey,
  matchesActivityLogQuery,
  ACTIVITY_LOG_COMPARATORS,
  ACTIVITY_LOG_FILTER_FIELDS,
} from './activityLogBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { ActivityLogEntry } from '../../hotel.types';

function buildEntry(
  overrides: Partial<ActivityLogEntry> = {}
): ActivityLogEntry {
  return {
    id: 'log-1',
    branch_id: 'branch-a',
    stay_id: 'stay-1',
    care_log_entry_id: null,
    action: 'check_in',
    actor_staff_id: 'staff-1',
    description: 'Checked in for a Hotel stay',
    created_at: '2026-08-19T03:00:00.000Z',
    actor_staff: { display_name: 'Staff One' },
    ...overrides,
  };
}

describe('ACTIVITY_LOG_FILTER_FIELDS', () => {
  it('the Date filter only looks back - the log has nothing in the future', () => {
    const dateField = ACTIVITY_LOG_FILTER_FIELDS.find(
      (field) => field.id === 'date'
    );
    expect(dateField).toMatchObject({ type: 'date-range', pastOnly: true });
  });
});

describe('applyActivityLogFilters', () => {
  const entries = [
    buildEntry({ id: '1', action: 'check_in' }),
    buildEntry({ id: '2', action: 'task_completed' }),
  ];

  it('narrows by action', () => {
    const tiles: FilterTile[] = [
      { fieldId: 'action', value: 'task_completed' },
    ];
    expect(applyActivityLogFilters(entries, tiles).map((e) => e.id)).toEqual([
      '2',
    ]);
  });

  it('returns everything when there are no tiles', () => {
    expect(applyActivityLogFilters(entries, []).map((e) => e.id)).toEqual([
      '1',
      '2',
    ]);
  });
});

describe('matchesActivityLogQuery', () => {
  it('matches on description or actor name', () => {
    const entry = buildEntry({
      description: 'Checked in for a Hotel stay',
      actor_staff: { display_name: 'Staff One' },
    });
    expect(matchesActivityLogQuery(entry, 'checked in')).toBe(true);
    expect(matchesActivityLogQuery(entry, 'staff one')).toBe(true);
    expect(matchesActivityLogQuery(entry, 'nope')).toBe(false);
  });

  it('never throws for a system entry with no actor', () => {
    const entry = buildEntry({ actor_staff: null });
    expect(matchesActivityLogQuery(entry, 'staff')).toBe(false);
  });
});

describe('deriveActivityLogSortKey + ACTIVITY_LOG_COMPARATORS', () => {
  it('defaults to date-desc', () => {
    expect(deriveActivityLogSortKey(null)).toBe('date-desc');
  });

  it('sorts newest first', () => {
    const entries = [
      buildEntry({ id: '1', created_at: '2026-01-01T00:00:00.000Z' }),
      buildEntry({ id: '2', created_at: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(
      [...entries].sort(ACTIVITY_LOG_COMPARATORS['date-desc']).map((e) => e.id)
    ).toEqual(['2', '1']);
  });
});

describe('deriveActivityLogServerParams', () => {
  it('returns no params when there is no date tile', () => {
    expect(deriveActivityLogServerParams([])).toEqual({});
  });

  it('resolves a preset tile to dateFrom/dateTo', () => {
    const tiles: FilterTile[] = [
      { fieldId: 'date', value: { preset: 'today', from: null, to: null } },
    ];
    const params = deriveActivityLogServerParams(tiles);
    expect(params.dateFrom).toBeTruthy();
    expect(params.dateTo).toBeTruthy();
  });

  it('a "Last 7 days" tile ends today - never in the future', () => {
    const tiles: FilterTile[] = [
      {
        fieldId: 'date',
        value: { preset: 'last_7_days', from: null, to: null },
      },
    ];
    const params = deriveActivityLogServerParams(tiles);
    const todayUtc = new Date().toISOString().slice(0, 10);
    expect(params.dateTo).toBe(todayUtc);
    expect(params.dateFrom! < params.dateTo!).toBe(true);
  });

  it('uses the custom from/to bounds as-is for a custom-preset tile', () => {
    const tiles: FilterTile[] = [
      {
        fieldId: 'date',
        value: { preset: 'custom', from: '2026-01-01', to: '2026-01-15' },
      },
    ];
    expect(deriveActivityLogServerParams(tiles)).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-15',
    });
  });

  it('omits both bounds for the "all" preset', () => {
    const tiles: FilterTile[] = [
      { fieldId: 'date', value: { preset: 'all', from: null, to: null } },
    ];
    expect(deriveActivityLogServerParams(tiles)).toEqual({});
  });
});

describe('activityLogDateKey', () => {
  it('returns a YYYY-MM-DD key derived from the entry timestamp', () => {
    const entry = buildEntry({ created_at: '2026-08-19T03:00:00.000Z' });
    expect(activityLogDateKey(entry)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
