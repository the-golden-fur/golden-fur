-- M04 follow-up (booking-status unification): grooming_sessions no longer
-- tracks its own lifecycle status or start/complete timestamps - both now
-- live solely on the parent bookings row (bookings.status/started_at/
-- completed_at), driven by the same Start/Complete/Mark as Paid actions
-- every other category uses. grooming_sessions.booking_id is NOT NULL (no
-- walk-in concept for Grooming, unlike daycare_sessions), so every row has
-- exactly one owning booking to defer to - nothing is lost by dropping
-- these columns.
--
-- This table keeps queue_position and assigned_groomer_id - both still
-- genuinely grooming-specific (display ordering override, and RLS/query
-- scoping without a join back to bookings for every read) - it just no
-- longer duplicates the status/timestamp fields Grooming shares with every
-- other service category.

alter table public.grooming_sessions
  drop column status,
  drop column started_at,
  drop column completed_at;

drop type public.grooming_status;
