-- Epic C (#32): first RLS on pets - customer-self manage-all (mirrors
-- customer_profiles' self policy shape), plus a staff manage-all policy
-- using the same role list as the customer_profiles fix (...022) so Issue
-- #35's walk-in flow can create/edit a pet on a customer's behalf. Does NOT
-- attempt to resolve the separately-flagged pets.branch_id RLS gap (Sprint 2
-- follow-up per Modules-Overview - see Epic C Guide's Out of Scope).

alter table public.pets enable row level security;

create policy "Customers can view their own pets"
  on public.pets
  for select
  to authenticated
  using (auth.uid() = customer_id);

create policy "Customers can insert their own pets"
  on public.pets
  for insert
  to authenticated
  with check (auth.uid() = customer_id);

create policy "Customers can update their own pets"
  on public.pets
  for update
  to authenticated
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

create policy "Customers can delete their own pets"
  on public.pets
  for delete
  to authenticated
  using (auth.uid() = customer_id);

create policy "Staff can manage all pets"
  on public.pets
  for all
  to authenticated
  using (public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin'))
  with check (public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin'));
