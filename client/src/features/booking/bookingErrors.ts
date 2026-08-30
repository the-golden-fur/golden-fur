/**
 * Turns a raw `POST /bookings` failure into something a receptionist or
 * customer can act on.
 *
 * Supabase/PostgREST errors leak column names, "schema cache", and
 * constraint text - meaningless to a user and alarming to see - so those
 * are collapsed to a generic message. A message the server actually wrote
 * for a person ("No eligible staff available for the requested time")
 * passes through untouched. The capacity/duration hint (#22 follow-up) is
 * only added when the rejection is genuinely about the slot, not appended
 * to every error the way it used to be.
 */
export function friendlyBookingError(raw: string | undefined | null): string {
  const message = raw?.trim();
  if (!message) return 'Could not create the booking. Please try again.';

  const looksInternal =
    /schema cache|column .+ of |relation .+ does not exist|violates .+ constraint|duplicate key value|PGRST\d|could not find the/i.test(
      message
    );
  if (looksInternal) {
    return 'Could not create the booking right now — something went wrong on our end. Please try again, and let an admin know if it keeps happening.';
  }

  const looksLikeSlotConflict =
    /capacity|slot|no eligible staff|already booked|overlap|fully booked|not available for the requested time/i.test(
      message
    );
  if (looksLikeSlotConflict) {
    return `${message} This can happen when the actual service or package runs longer than the time you picked — try choosing a different time.`;
  }

  return message;
}
