function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** "1d 4h 05m" once a day or more is left (seconds are noise at that
 * range), "4h 05m 09s" under a day, "05m 09s" under an hour. */
export function formatCountdown(totalMs: number): string {
  const totalSeconds = Math.floor(Math.abs(totalMs) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${pad2(minutes)}m`;
  if (hours > 0) return `${hours}h ${pad2(minutes)}m ${pad2(seconds)}s`;
  return `${pad2(minutes)}m ${pad2(seconds)}s`;
}
