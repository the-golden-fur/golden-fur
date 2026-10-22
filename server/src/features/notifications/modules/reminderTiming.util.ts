/**
 * How late a lead-time reminder ("15 minutes before checkout", "1 day before
 * your appointment") may still go out. Shared by stayCheckout.job.ts and
 * appointmentReminder.job.ts.
 *
 * The production server (Render free plan) sleeps when idle, so a poll can
 * resume long after a reminder's moment. Sending it anyway is how a
 * "15 minutes before checkout" email ended up arriving 2 minutes before -
 * or after - checkout. Past this tolerance the reminder is skipped instead:
 * 5 minutes for the shortest leads, a third of the lead for longer ones, so
 * a "1 day before" reminder still survives a short outage while a
 * "15 minutes before" one never arrives meaningfully late.
 */
const MIN_LATE_TOLERANCE_MS = 5 * 60 * 1000;

export function reminderLateToleranceMs(leadMinutes: number): number {
  return Math.max(MIN_LATE_TOLERANCE_MS, (leadMinutes * 60 * 1000) / 3);
}

/** Whether a reminder due at `remindAtMs` should still be sent at `nowMs` -
 * false while it isn't due yet, and false once it's too late to be useful. */
export function isReminderSendable(
  nowMs: number,
  remindAtMs: number,
  leadMinutes: number
): boolean {
  if (nowMs < remindAtMs) return false;
  return nowMs - remindAtMs <= reminderLateToleranceMs(leadMinutes);
}
