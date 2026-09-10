/**
 * Human-readable length for a minute count - `1h 30m`, `45m`, `2h`. Small
 * shared helper - the booking wizard's Date & Time step (end-time/duration
 * caption) and the admin Package Builder's derived total-time preview render
 * a duration the same way.
 */
export function formatDuration(totalMinutes: number): string {
  const value = Number(totalMinutes);
  const minutes = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}
