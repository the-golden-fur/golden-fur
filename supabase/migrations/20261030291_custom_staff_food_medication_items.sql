-- Custom change (staff food/medication library): each staff member keeps
-- their own reusable food/medication items for Hotel/Daycare care
-- instructions - typed once, then picked from a dropdown at check-in or
-- staff-mode booking creation, auto-filling the whole row. Unlike
-- product_catalog (customer-owned, or admin-managed global, and also the
-- Cashier Misc Sale POS backing table), these two tables are purpose-built
-- for staff: no price/category/service_scope, just the fields a feeding or
-- medication row actually needs.
--
-- Each item also has an is_public toggle: an owner's item is always visible
-- to them (public or private); everyone else only sees it once it's public,
-- alongside its owner's name - the first owner+visibility-toggle table in
-- this repo. RLS combines two existing idioms: vet_medication_catalog's
-- auth.uid() = <owner column> ownership check, and
-- staff_unavailability_blocks' current_staff_role() role check - plus a new
-- "or is_public = true" SELECT branch, and an Admin/Superadmin "manage any
-- public item" UPDATE branch (mirrors HOTEL_ADMIN_ROLES = Admin/Superadmin).
--
-- As with every table this server's service-role client touches, RLS here
-- is defense-in-depth/documentation, not the real enforcement - the
-- service-layer functions (server/src/features/staffItems/) are what
-- actually enforce ownership and the public/private read rule, since the
-- server bypasses RLS entirely on every request.

create table public.staff_food_items (
  id uuid primary key default gen_random_uuid(),
  owner_staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  name text not null,
  quantity text not null,
  quantity_unit text check (
    quantity_unit is null or quantity_unit in (
      'cup', 'gram', 'ounce', 'can', 'scoop',
      'tablespoon', 'teaspoon', 'milliliter', 'piece'
    )
  ),
  special_instructions text,
  photo_url text,
  is_public boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_staff_id, name)
);

create index staff_food_items_owner_idx on public.staff_food_items(owner_staff_id);
create index staff_food_items_public_idx
  on public.staff_food_items(is_public)
  where archived_at is null;

create table public.staff_medication_items (
  id uuid primary key default gen_random_uuid(),
  owner_staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  name text not null,
  dose text not null,
  dose_unit text check (
    dose_unit is null or dose_unit in (
      'mg', 'ml', 'tablet', 'capsule', 'drop', 'application'
    )
  ),
  administration_notes text,
  photo_url text,
  is_public boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_staff_id, name)
);

create index staff_medication_items_owner_idx on public.staff_medication_items(owner_staff_id);
create index staff_medication_items_public_idx
  on public.staff_medication_items(is_public)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- RLS - identical shape on both tables.
-- ---------------------------------------------------------------------------

alter table public.staff_food_items enable row level security;

create policy "Staff can read their own or public food items"
  on public.staff_food_items
  for select
  to authenticated
  using (auth.uid() = owner_staff_id or is_public = true);

create policy "Staff can insert their own food items"
  on public.staff_food_items
  for insert
  to authenticated
  with check (
    auth.uid() = owner_staff_id
    and public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Superadmin',
      'Front Desk', 'Groomer', 'Pet Assistant'
    )
  );

create policy "Owners and admins can update food items"
  on public.staff_food_items
  for update
  to authenticated
  using (
    auth.uid() = owner_staff_id
    or (is_public = true and public.current_staff_role() in ('Admin', 'Superadmin'))
  )
  with check (
    auth.uid() = owner_staff_id
    or (is_public = true and public.current_staff_role() in ('Admin', 'Superadmin'))
  );

alter table public.staff_medication_items enable row level security;

create policy "Staff can read their own or public medication items"
  on public.staff_medication_items
  for select
  to authenticated
  using (auth.uid() = owner_staff_id or is_public = true);

create policy "Staff can insert their own medication items"
  on public.staff_medication_items
  for insert
  to authenticated
  with check (
    auth.uid() = owner_staff_id
    and public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Superadmin',
      'Front Desk', 'Groomer', 'Pet Assistant'
    )
  );

create policy "Owners and admins can update medication items"
  on public.staff_medication_items
  for update
  to authenticated
  using (
    auth.uid() = owner_staff_id
    or (is_public = true and public.current_staff_role() in ('Admin', 'Superadmin'))
  )
  with check (
    auth.uid() = owner_staff_id
    or (is_public = true and public.current_staff_role() in ('Admin', 'Superadmin'))
  );
