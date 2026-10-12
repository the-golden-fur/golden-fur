/**
 * A pet's age from its date of birth - `3 yr 2 mo`, `3 yr`, `5 mo`,
 * `12 days`. Small shared helper - the customer Pet Manager's Age column and
 * the Add a pet form's live hint under Date of birth render it the same way.
 *
 * Returns null when there is no date, the date is invalid, or it is in the
 * future. The `YYYY-MM-DD` value is read by its parts rather than through
 * `new Date(string)`, which parses it as UTC and can land a day early in
 * timezones behind UTC.
 */
export function formatPetAge(
  dateOfBirth: string | null | undefined,
  today: Date = new Date()
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth ?? '');
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  // Rejects impossible dates (e.g. 2024-02-31 rolls over into March).
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (birth > now) return null;

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    // Day 0 of this month is the last day of the previous one.
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years > 0) return months > 0 ? `${years} yr ${months} mo` : `${years} yr`;
  if (months > 0) return `${months} mo`;
  return days === 1 ? '1 day' : `${days} days`;
}
