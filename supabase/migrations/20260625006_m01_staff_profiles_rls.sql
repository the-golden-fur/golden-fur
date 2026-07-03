alter table public.staff_profiles enable row level security;

create policy "Staff can read their own profile"
  on public.staff_profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Staff can update their own profile"
  on public.staff_profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Superadmins can read all staff profiles"
  on public.staff_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles as sp
      where sp.id = auth.uid() and sp.role = 'Superadmin'
    )
  );

create policy "Admins and superadmins can manage staff profile metadata"
  on public.staff_profiles
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.staff_profiles as sp
      where sp.id = auth.uid() and sp.role in ('Admin', 'Superadmin')
    )
  );

create policy "Admins and superadmins can update staff profile metadata"
  on public.staff_profiles
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
