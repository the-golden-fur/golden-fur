-- Custom change (Daycare overdue checkout fee): the overdue-checkout job
-- (daycareOverdue.job.ts) polls every few minutes for booked Daycare pets
-- still checked in past their booked end time. This column is the dedupe
-- marker so an owner is only ever notified once per stay regardless of how
-- many poll ticks pass while the pet is still there - same single-writer
-- pattern as bookings.reminder_sent_at (20260809119).

alter table public.stays
  add column overdue_notified_at timestamptz;
