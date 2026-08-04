-- Monthly schedule addendum: "days off" remastered into typed leave so the
-- new Monthly Schedule calendar can distinguish Rest Day (fixed, set only by
-- Admin/Supervisor/Superadmin on a staff member's behalf) from Vacation
-- Leave / Sick Leave (self-requestable, same approval flow as today) and the
-- pre-existing free-form "Other" entries. Reuses staff_unavailability_blocks
-- end-to-end - no new table; every existing approval/quick-action/full-day
-- mechanism (and get_staff_availability()'s Check 3) already works
-- unmodified against any leave_type.

create type public.unavailability_leave_type as enum (
  'Rest Day',
  'Vacation Leave',
  'Sick Leave',
  'Other'
);

alter table public.staff_unavailability_blocks
  add column leave_type public.unavailability_leave_type not null default 'Other';
