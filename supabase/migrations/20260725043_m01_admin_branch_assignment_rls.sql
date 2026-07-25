-- Revision Batch 1 - Epic A (#73): staff-creation RLS - Admin branch_id
-- write parity with Superadmin.
--
-- Confirmed against the merged migration history (20260701015) that the
-- staff_profiles INSERT policy already reads
-- `current_staff_role() in ('Admin', 'Superadmin')` - Admin already has
-- database-level permission to write branch_id on staff creation. Re-created
-- here (functionally a no-op) so this policy's intent is documented
-- explicitly under this issue, and so a future reader tracing #73 finds the
-- policy statement rather than a migration that changed nothing on paper.
--
-- The actual pre-existing gap was one layer up, in the application service
-- (server/src/features/staff/services/staffManagement.service.ts
-- createStaffAccount): Admin was restricted to branch_id === their own
-- branch, while Superadmin could pick either branch freely. That
-- restriction is lifted in this same batch so Admin has full parity, not
-- just same-branch parity - see this issue's Guide entry for the open item
-- flagged for client confirmation (the alternative on the table is removing
-- Admin's staff-creation ability entirely).
drop policy if exists "Admins and superadmins can manage staff profile metadata"
  on public.staff_profiles;

create policy "Admins and superadmins can manage staff profile metadata"
  on public.staff_profiles
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
