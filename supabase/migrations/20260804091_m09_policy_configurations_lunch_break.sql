-- Scheduling addendum: fixed daily lunch break (default 12:00-13:00) during
-- which nothing may be booked. Reuses policy_configurations' existing
-- default-row + per-branch-override pattern (...037) rather than resurrecting
-- branches.break_window (dropped by ...010 because it was dead, unwired
-- schema - this time the columns are actually read, by
-- get_staff_availability() and getDaySlots()).

alter table public.policy_configurations
  add column lunch_break_enabled boolean not null default true,
  add column lunch_break_start time not null default '12:00',
  add column lunch_break_end time not null default '13:00';
