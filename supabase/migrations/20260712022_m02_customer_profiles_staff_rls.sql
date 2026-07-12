-- Epic C (#31): customer_profiles today has only customer-self SELECT/UPDATE
-- policies (...009) with no staff-facing policy at all, blocking Issue #35's
-- walk-in management from having any legal RLS path to the table. Adds
-- staff SELECT/INSERT/UPDATE access scoped to current_staff_role() in (...),
-- mirroring the shape of Epic B's #28 Supervisor RLS fix. Existing
-- customer-self policies are untouched.
--
-- Note: server-side requests use the service-role Supabase client and bypass
-- RLS entirely (see customer.controller.ts's isAuthorizedStaff check), so
-- this migration is defense-in-depth alongside the application-layer role
-- check, not the primary enforcement layer - mirrors the precedent set in
-- unavailabilityBlock.service.ts.

create policy "Staff can read customer profiles"
  on public.customer_profiles
  for select
  to authenticated
  using (public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin'));

create policy "Staff can insert customer profiles"
  on public.customer_profiles
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin'));

create policy "Staff can update customer profiles"
  on public.customer_profiles
  for update
  to authenticated
  using (public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin'))
  with check (public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin'));
