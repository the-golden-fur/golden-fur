-- Custom change: Service Types admin CRUD + Staff/Cage Picker config
-- addendum. Admin-configurable display name/active flag for the service
-- lines a customer chooses between at booking time (Grooming/Hotel/Daycare/
-- Veterinary), plus a per-type toggle for whether the Staff Picker / Cage
-- Picker steps are offered on that type. `key` is fixed to the existing
-- hardcoded ServiceCategory value each seeded row represents
-- (booking.types.ts / maintenance.types.ts) - renaming a row's `name` only
-- changes its customer-facing label, the underlying booking/availability/
-- pricing logic for that category is still code-driven and unaffected by
-- this table. A brand-new row created via the admin UI is free-text on
-- `key` and will show up as selectable (if active) but won't have matching
-- category-specific behavior (availability, capacity, pricing, eligibility)
-- until that is separately implemented in code - documented, not hidden,
-- in the admin page's own copy.

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  is_active boolean not null default true,
  staff_picker_enabled boolean not null default false,
  cage_picker_enabled boolean not null default false,
  created_by uuid references public.staff_profiles(id),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_types enable row level security;

-- Every authenticated user (staff and customers) needs this for the booking
-- flow's service-type selection step, same open-read shape as breeds.
create policy "Any authenticated user can read service types"
  on public.service_types
  for select
  to authenticated
  using (true);

create policy "Admins and superadmins can insert service types"
  on public.service_types
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can update service types"
  on public.service_types
  for update
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

-- Seed: matches every existing customer-selectable ServiceCategory value.
-- staff_picker_enabled mirrors policy_configurations' documented defaults
-- (Grooming/Veterinary, both true - Hotel/Daycare never had a staff picker).
-- cage_picker_enabled is new and only meaningful for Hotel, whose `cages`
-- table (migration 20260727050) already has an unused 'Reserved' status
-- reserved for exactly this. 'Misc' (administrative-only bookings, e.g.
-- Initial Assessment) is intentionally excluded - it is never customer-
-- selectable at this step.
insert into public.service_types (key, name, staff_picker_enabled, cage_picker_enabled) values
  ('Grooming', 'Grooming', true, false),
  ('Hotel', 'Hotel', false, true),
  ('Daycare', 'Daycare', false, false),
  ('Veterinary', 'Veterinary', true, false);
