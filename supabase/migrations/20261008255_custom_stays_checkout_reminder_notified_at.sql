-- Custom change (checkout countdown notifications): dedupe marker for the
-- 15-minutes-before-checkout reminder (stayCheckout.job.ts), so an owner is
-- only reminded once per stay however many poll ticks pass - same
-- claim-then-send pattern as stays.overdue_notified_at (20261004242), which
-- now marks the "countdown complete" notice for Hotel stays as well as
-- Daycare.

alter table public.stays
  add column checkout_reminder_notified_at timestamptz;
