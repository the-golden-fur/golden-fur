-- Custom change (Daycare overdue checkout fee): adds the notification event
-- fired once when a booked Daycare pet is still checked in past its booked
-- end time, telling the owner the per-hour overdue fee is about to start
-- (see daycareOverdue.job.ts).
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation already
-- used by 20260814124/20260819137/20260911189/20260913201's own
-- notification_event_type additions.

alter type public.notification_event_type add value 'daycare_overdue';
