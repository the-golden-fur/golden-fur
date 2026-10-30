import { describe, expect, it } from 'vitest';
import { findCareTimeOutsideVisit } from './daycareCareTimes.util.ts';

// 9:00 AM - 1:00 PM in Asia/Manila (UTC+8).
const VISIT = {
  scheduledStart: '2026-08-03T01:00:00.000Z',
  scheduledEnd: '2026-08-03T05:00:00.000Z',
  timezone: 'Asia/Manila',
};

function check(care: Parameters<typeof findCareTimeOutsideVisit>[0]['care']) {
  return findCareTimeOutsideVisit({ ...VISIT, care });
}

describe('findCareTimeOutsideVisit', () => {
  it('accepts times from the start up to the last minute before the end', () => {
    expect(
      check({
        feeding: [{ scheduled_time: '09:00' }],
        walking: [{ scheduled_time: '11:30' }],
        playing: [{ scheduled_time: '12:59' }],
      })
    ).toBeNull();
  });

  it.each([
    ['feeding', 'Feeding at 5:00 AM', '05:00'],
    ['walking', 'Walking at 8:59 AM', '08:59'],
    ['playing', 'Playtime at 1:00 PM', '13:00'],
    ['feeding', 'Feeding at 2:30 PM', '14:30'],
  ])('rejects %s outside the visit: %s', (field, label, time) => {
    expect(check({ [field]: [{ scheduled_time: time }] })).toContain(label);
  });

  it('reads medication times in both saved formats', () => {
    expect(
      check({ medications: [{ scheduled_times: ['09:30', '12:15 PM'] }] })
    ).toBeNull();
    expect(
      check({ medications: [{ scheduled_times: ['12:15 PM', '1:00 PM'] }] })
    ).toContain('Medication at 1:00 PM');
    expect(
      check({ medications: [{ scheduled_times: ['12:30 AM'] }] })
    ).toContain('Medication at 12:30 AM');
  });

  it('compares in the branch timezone, not UTC', () => {
    expect(check({ feeding: [{ scheduled_time: '01:00' }] })).not.toBeNull();
  });

  it('ignores rows with no clock time, such as Hotel day periods', () => {
    expect(
      check({ feeding: [{ scheduled_time: null }, {}], medications: [{}] })
    ).toBeNull();
  });

  it('applies only the start to a visit running past midnight', () => {
    const lateVisit = {
      scheduledStart: '2026-08-03T13:00:00.000Z', // 9:00 PM
      scheduledEnd: '2026-08-03T17:00:00.000Z', // 1:00 AM next day
      timezone: 'Asia/Manila',
    };

    expect(
      findCareTimeOutsideVisit({
        ...lateVisit,
        care: { feeding: [{ scheduled_time: '23:30' }] },
      })
    ).toBeNull();
    expect(
      findCareTimeOutsideVisit({
        ...lateVisit,
        care: { feeding: [{ scheduled_time: '20:00' }] },
      })
    ).not.toBeNull();
  });
});
