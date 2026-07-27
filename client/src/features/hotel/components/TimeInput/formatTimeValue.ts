/** "07:00" (native <input type="time"> value) -> "7:00 AM". */
export function formatTimeValue(hhmm: string): string {
  if (!hhmm) return '';

  const [hourStr, minuteStr] = hhmm.split(':');
  const hour = Number(hourStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  return `${hour12}:${minuteStr} ${period}`;
}
