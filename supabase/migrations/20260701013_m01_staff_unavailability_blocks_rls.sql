alter table public.staff_unavailability_blocks enable row level security;

create policy "Staff can read their own unavailability blocks"
  on public.staff_unavailability_blocks
  for select
  to authenticated
  using (auth.uid() = staff_id);

create policy "Staff can create their own unavailability blocks"
  on public.staff_unavailability_blocks
  for insert
  to authenticated
  with check (auth.uid() = staff_id and auth.uid() = created_by);

create policy "Staff can update their own unavailability blocks"
  on public.staff_unavailability_blocks
  for update
  to authenticated
  using (auth.uid() = staff_id)
  with check (auth.uid() = staff_id);

create policy "Staff can delete their own unavailability blocks"
  on public.staff_unavailability_blocks
  for delete
  to authenticated
  using (auth.uid() = staff_id);

create policy "Admins and superadmins can read all unavailability blocks"
  on public.staff_unavailability_blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles as sp
      where sp.id = auth.uid() and sp.role in ('Admin', 'Superadmin')
    )
  );

create policy "Admins and superadmins can insert all unavailability blocks"
  on public.staff_unavailability_blocks
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.staff_profiles as sp
      where sp.id = auth.uid() and sp.role in ('Admin', 'Superadmin')
    )
  );

create policy "Admins and superadmins can update all unavailability blocks"
  on public.staff_unavailability_blocks
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles as sp
      where sp.id = auth.uid() and sp.role in ('Admin', 'Superadmin')
    )
  )
  with check (
    exists (
      select 1
      from public.staff_profiles as sp
      where sp.id = auth.uid() and sp.role in ('Admin', 'Superadmin')
    )
  );

create policy "Admins and superadmins can delete all unavailability blocks"
  on public.staff_unavailability_blocks
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles as sp
      where sp.id = auth.uid() and sp.role in ('Admin', 'Superadmin')
    )
  );
