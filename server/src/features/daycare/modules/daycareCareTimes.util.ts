import { formatDaycareCutoff } from './daycareCutoff.util.ts';

interface TimedRow {
  scheduled_time?: string | null;
}

export interface DaycareCareTimes {
  feeding?: TimedRow[] | null;
  walking?: TimedRow[] | null;
  playing?: TimedRow[] | null;
  medications?: Array<{ scheduled_times?: string[] | null }> | null;
}

/** Medication times are saved as "HH:MM" at booking but "h:mm AM/PM" at
 * check-in; every other care time is "HH:MM". Null for anything else. */
function toClockTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i.exec(value.trim());
  if (!match) return null;

  const [, hour, minute, period] = match;
  const hour24 = period
    ? (Number(hour) % 12) + (period.toUpperCase() === 'PM' ? 12 : 0)
    : Number(hour);

  return `${String(hour24).padStart(2, '0')}:${minute}`;
}

function branchLocal(iso: string, timeZone: string) {
  const instant = new Date(iso);

  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant),
    time: new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).format(instant),
  };
}

/**
 * The first Daycare care time outside its visit, as a message, or null when
 * they all fit. A care time may start from the visit's start up to, but not
 * including, its end - the pet is leaving then. Times are branch-local, so the
 * comparison is too. A visit running past midnight (a late walk-in) has no
 * same-day end to compare against, so only its start applies. A value that
 * isn't a clock time is left to the validators.
 */
export function findCareTimeOutsideVisit({
  care,
  scheduledStart,
  scheduledEnd,
  timezone,
}: {
  care: DaycareCareTimes;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
}): string | null {
  const start = branchLocal(scheduledStart, timezone);
  const end = branchLocal(scheduledEnd, timezone);
  const endsSameDay = start.date === end.date;

  const sections: Array<[string, Array<string | null | undefined>]> = [
    ['Feeding', (care.feeding ?? []).map((row) => row.scheduled_time)],
    ['Walking', (care.walking ?? []).map((row) => row.scheduled_time)],
    ['Playtime', (care.playing ?? []).map((row) => row.scheduled_time)],
    [
      'Medication',
      (care.medications ?? []).flatMap((row) => row.scheduled_times ?? []),
    ],
  ];

  for (const [section, times] of sections) {
    for (const value of times) {
      const time = value ? toClockTime(value) : null;

      if (time && (time < start.time || (endsSameDay && time >= end.time))) {
        return `${section} at ${formatDaycareCutoff(time)} is outside this visit - care times must start from ${formatDaycareCutoff(start.time)} and before ${formatDaycareCutoff(end.time)}`;
      }
    }
  }

  return null;
}
