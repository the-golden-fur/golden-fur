-- Custom change (front-desk cage override): Receptionist/Front Desk (and
-- Supervisor/Admin/Superadmin) can close a cage to customers for a short,
-- staff-chosen time - e.g. cleaning or an incident - without the
-- Admin-only, open-ended Under Maintenance status.
--
-- A cage counts as closed while closed_until > now(); once that time passes
-- it is open again on its own, so no scheduled job is needed to reopen it.
-- Staff bookings and check-in ignore the closure - only customer-facing
-- cage picking and Hotel capacity checks honor it (cagePicker.service.ts,
-- capacity.service.ts).
--
-- No RLS changes: the close/reopen writes go through the server's
-- service-role Supabase client, the same as every other cage write
-- (cageStatus.service.ts). Both columns are nullable with no default, so
-- the existing cage seeds need no change.

alter table public.cages
  add column closed_until timestamptz,
  add column closed_by_staff_id uuid references public.staff_profiles(id);
