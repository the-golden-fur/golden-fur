const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * "3 months ago" / "2 days ago" / "today" style relative-time phrasing, e.g.
 * for pets.assessed_at. No existing helper in this app does this - every
 * other timestamp is shown as a raw ISO string or via toLocaleDateString().
 * Deliberately coarse (months/years, not weeks) - this is for "how stale is
 * this" context, not precise scheduling.
 */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date()
): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();

  if (diffMs < DAY) return 'today';
  if (diffMs < 2 * DAY) return 'yesterday';
  if (diffMs < MONTH) {
    const days = Math.floor(diffMs / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (diffMs < YEAR) {
    const months = Math.floor(diffMs / MONTH);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  const years = Math.floor(diffMs / YEAR);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
