-- Custom change (per-branch Grooming hours): Grooming is not offered for the
-- whole of a branch's operating day, so Superadmin System Configuration can
-- now set, per weekday, the times Grooming is actually bookable. Same shape
-- as operating_hours ({"monday": {"open": "10:00", "close": "15:00"}, ...},
-- branch-local wall-clock time). A day absent from this map means Grooming
-- follows that day's full operating hours - so the '{}' default changes
-- nothing for an existing branch until it is configured.
--
-- Read by availability.service.ts (slot generation + the booking-time gate)
-- only; operating_hours and get_staff_availability() are untouched. No new
-- RLS: the existing "Superadmins can manage branches" update policy
-- (20260728064) already covers the whole row.

alter table public.branches
  add column grooming_hours jsonb not null default '{}'::jsonb;
