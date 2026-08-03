-- Hotel and Daycare have no dedicated assigned-staff role (unlike Grooming/
-- Veterinary), so Groomer and Pet Assistant may now also check pets in/out
-- of Hotel and Daycare - matches HOTEL_ADVANCE_ROLES/DAYCARE_ADVANCE_ROLES
-- in hotel.types.ts/daycare.types.ts, the actual enforcement boundary
-- (staff writes go through the service-role client, bypassing RLS - see
-- booking.service.ts's own dev notes on this). Kept in sync here as
-- defense-in-depth, matching the "RLS + application-layer check" pattern
-- used elsewhere in this app (M01 Process 9's self-approval guard).
-- Vet, Cashier, and Receptionist roles are unchanged.

drop policy "Staff can read hotel stays at their branch" on public.hotel_stays;
drop policy "Staff can create hotel stays at their branch" on public.hotel_stays;
drop policy "Staff can update hotel stays at their branch" on public.hotel_stays;

create policy "Staff can read hotel stays at their branch"
  on public.hotel_stays
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and cage_id in (
      select c.id from public.cages c
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Staff can create hotel stays at their branch"
  on public.hotel_stays
  for insert
  to authenticated
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and cage_id in (
      select c.id from public.cages c
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Staff can update hotel stays at their branch"
  on public.hotel_stays
  for update
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and cage_id in (
      select c.id from public.cages c
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  )
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and cage_id in (
      select c.id from public.cages c
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

drop policy "Staff can read daycare sessions at their branch" on public.daycare_sessions;
drop policy "Staff can create daycare sessions at their branch" on public.daycare_sessions;
drop policy "Staff can update daycare sessions at their branch" on public.daycare_sessions;

create policy "Staff can read daycare sessions at their branch"
  on public.daycare_sessions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Staff can create daycare sessions at their branch"
  on public.daycare_sessions
  for insert
  to authenticated
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Staff can update daycare sessions at their branch"
  on public.daycare_sessions
  for update
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  )
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );
