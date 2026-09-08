-- Configurable staff concurrency for the Staff Picker.
--
-- WHY: get_staff_availability() Check 2 and confirmCapacityAfterInsert
-- (Grooming/Veterinary) both hardcode a capacity of 1 - one staff member can
-- hold exactly one overlapping Pending/In Progress/Completed booking. The
-- multi-booking checkout (#148) surfaced a need for admins to relax this: let
-- one groomer take N pets in the same time window (e.g. two small dogs at
-- once). This adds the knob; the same-day RPC migration and the TS enforcement
-- points read it.
--
-- Follows the policy_configurations numeric-column pattern
-- (20260829146 downpayment_hold_hours, 20260902166 booking_notice_period):
-- one NOT NULL column with a CHECK and a documented default, seeded onto the
-- existing rows by the default itself (policy_configurations is
-- migration-seeded only - no supabase/seeds/** file).

alter table public.policy_configurations
  add column max_concurrent_bookings_per_staff integer not null default 1
    check (max_concurrent_bookings_per_staff >= 1);

comment on column public.policy_configurations.max_concurrent_bookings_per_staff is
  'How many overlapping Grooming/Veterinary bookings one staff member may be assigned at once. 1 = one pet at a time (default). Read by get_staff_availability() and confirmCapacityAfterInsert.';
