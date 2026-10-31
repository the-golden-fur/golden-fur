-- Custom change (booking date limit): how far ahead a booking can be made at
-- each branch. Before this, the Slot Picker and the API accepted any future
-- date. Default and hard ceiling are both 365 days (1 year) - a Superadmin
-- can shorten it per branch (Settings > Config > Branches > Configure) but
-- never push it past a year.
--
-- A branch column rather than a policy_configurations knob: the /branches
-- routes are Superadmin-only, which is exactly who may change it, and every
-- enforcement point (getDaySlots, assertWithinAdvanceBookingWindow) already
-- reads the branch row for its timezone. Existing RLS on branches covers it.

alter table public.branches
  add column max_advance_booking_days integer not null default 365
    check (max_advance_booking_days between 1 and 365);

comment on column public.branches.max_advance_booking_days is
  'Latest bookable calendar date = today (branch timezone) + this many days, inclusive. 1-365. Applies to new bookings and reschedules, never walk-ins. Enforced by getDaySlots and assertWithinAdvanceBookingWindow.';
