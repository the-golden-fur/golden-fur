create or replace function public.current_staff_role()
returns public.staff_role
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.staff_profiles
  where id = auth.uid()
  limit 1
$$;

revoke all on function public.current_staff_role() from public;
grant execute on function public.current_staff_role() to authenticated;

drop policy if exists "Superadmins can read all staff profiles"
  on public.staff_profiles;
drop policy if exists "Admins and superadmins can manage staff profile metadata"
  on public.staff_profiles;
drop policy if exists "Admins and superadmins can update staff profile metadata"
  on public.staff_profiles;

create policy "Superadmins can read all staff profiles"
  on public.staff_profiles
  for select
  to authenticated
  using (public.current_staff_role() = 'Superadmin');

create policy "Admins and superadmins can manage staff profile metadata"
  on public.staff_profiles
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can update staff profile metadata"
  on public.staff_profiles
  for update
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

drop policy if exists "Admins and superadmins can read all unavailability blocks"
  on public.staff_unavailability_blocks;
drop policy if exists "Admins and superadmins can insert all unavailability blocks"
  on public.staff_unavailability_blocks;
drop policy if exists "Admins and superadmins can update all unavailability blocks"
  on public.staff_unavailability_blocks;
drop policy if exists "Admins and superadmins can delete all unavailability blocks"
  on public.staff_unavailability_blocks;

create policy "Admins and superadmins can read all unavailability blocks"
  on public.staff_unavailability_blocks
  for select
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can insert all unavailability blocks"
  on public.staff_unavailability_blocks
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can update all unavailability blocks"
  on public.staff_unavailability_blocks
  for update
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can delete all unavailability blocks"
  on public.staff_unavailability_blocks
  for delete
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'));
