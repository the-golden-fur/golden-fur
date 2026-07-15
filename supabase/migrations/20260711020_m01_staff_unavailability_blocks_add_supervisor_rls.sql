-- Epic B fix (#28): Supervisor was always documented as having on-behalf-of
-- access to staff_unavailability_blocks (Modules-Features; Issue #24 AC-4),
-- but Epic A-1's ...013 / ...015 policies only ever granted Admin/Superadmin.
-- Adds Supervisor to the four "manage all" policies only; the four
-- "manage own" policies are untouched.
--
-- Note: server-side requests use the service-role Supabase client and bypass
-- RLS entirely (see unavailabilityBlock.service.ts's assertCanActOnTarget),
-- so this migration alone does not change API behavior — the corresponding
-- application-layer role list was updated in the same branch.

drop policy if exists "Admins and superadmins can read all unavailability blocks"
  on public.staff_unavailability_blocks;
drop policy if exists "Admins and superadmins can insert all unavailability blocks"
  on public.staff_unavailability_blocks;
drop policy if exists "Admins and superadmins can update all unavailability blocks"
  on public.staff_unavailability_blocks;
drop policy if exists "Admins and superadmins can delete all unavailability blocks"
  on public.staff_unavailability_blocks;

create policy "Admins, supervisors, and superadmins can read all unavailability blocks"
  on public.staff_unavailability_blocks
  for select
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin'));

create policy "Admins, supervisors, and superadmins can insert all unavailability blocks"
  on public.staff_unavailability_blocks
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin'));

create policy "Admins, supervisors, and superadmins can update all unavailability blocks"
  on public.staff_unavailability_blocks
  for update
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin'));

create policy "Admins, supervisors, and superadmins can delete all unavailability blocks"
  on public.staff_unavailability_blocks
  for delete
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin'));
