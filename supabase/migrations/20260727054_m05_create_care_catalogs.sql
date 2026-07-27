-- M05 Pet Hotel follow-up: food_catalog + medication_catalog - admin-managed
-- reference lists backing the hybrid dropdown/freetext pickers on the
-- check-in form (feeding food_type, medication medication_name). Mirrors
-- breeds' RLS shape exactly (migration 20260725041/45): open SELECT for
-- every authenticated user (staff need it at check-in), Admin/Superadmin-only
-- write.
--
-- A freetext value the receptionist types that doesn't match a catalog row
-- is never written back here - the picker only ever reads this table, never
-- inserts to it from the check-in flow. Only these two admin-management
-- endpoints (and their RLS-gated Admin/Superadmin write) create rows.

create table public.food_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Price charged when the hotel supplies this item (the pet's owner didn't
  -- bring their own) - null is not meaningful here (every catalog row must
  -- have a price to ever be selected as hotel-supplied); use 0 for "no
  -- charge" if that's ever needed, never a null row.
  price numeric(10, 2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medication_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric(10, 2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.food_catalog enable row level security;
alter table public.medication_catalog enable row level security;

create policy "Any authenticated user can read the food catalog"
  on public.food_catalog
  for select
  to authenticated
  using (true);

create policy "Admins and superadmins can insert food catalog items"
  on public.food_catalog
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can update food catalog items"
  on public.food_catalog
  for update
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can delete food catalog items"
  on public.food_catalog
  for delete
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Any authenticated user can read the medication catalog"
  on public.medication_catalog
  for select
  to authenticated
  using (true);

create policy "Admins and superadmins can insert medication catalog items"
  on public.medication_catalog
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can update medication catalog items"
  on public.medication_catalog
  for update
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can delete medication catalog items"
  on public.medication_catalog
  for delete
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'));
