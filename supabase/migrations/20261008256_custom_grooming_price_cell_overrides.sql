-- Custom change (per-item weight x coat pricing): a Superadmin can set any
-- of the 8 S/M/L/XL x SC/LC prices of a Grooming service or package that
-- varies by size and coat (use_pricing_matrix). Every cell still starts from
-- the shared pricing_configuration formula (deriveGroomingMatrix); a row
-- here replaces just that one cell's price for that one item, and a cell
-- with no row keeps following the formula. Deleting a row puts the cell
-- back on the formula.
--
-- Not a return of the old service_pricing_tiers (dropped in 20260726047),
-- which stored every cell by hand: only the cells a Superadmin overrode are
-- stored here. With the grid on, these prices apply at every branch - a
-- branch's own price (service_branch_availability.price_override) only
-- replaces the flat base price.

-- ---------------------------------------------------------------------------
-- 1. Services
-- ---------------------------------------------------------------------------

create table public.service_pricing_cell_overrides (
  service_id uuid not null references public.services(id) on delete cascade,
  weight_class text not null check (weight_class in ('S', 'M', 'L', 'XL')),
  coat_type text not null check (coat_type in ('SC', 'LC')),
  price numeric(10, 2) not null check (price >= 0),
  updated_by uuid references public.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (service_id, weight_class, coat_type)
);

alter table public.service_pricing_cell_overrides enable row level security;

create policy "Authenticated users can read service price cells"
  on public.service_pricing_cell_overrides
  for select
  to authenticated
  using (true);

create policy "Superadmins can add service price cells"
  on public.service_pricing_cell_overrides
  for insert
  to authenticated
  with check (public.current_staff_role() = 'Superadmin');

create policy "Superadmins can update service price cells"
  on public.service_pricing_cell_overrides
  for update
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');

create policy "Superadmins can delete service price cells"
  on public.service_pricing_cell_overrides
  for delete
  to authenticated
  using (public.current_staff_role() = 'Superadmin');

create trigger trg_archive_deleted_row
  after delete on public.service_pricing_cell_overrides
  for each row execute function public.archive_deleted_row();

-- ---------------------------------------------------------------------------
-- 2. Packages
-- ---------------------------------------------------------------------------

create table public.package_pricing_cell_overrides (
  package_id uuid not null references public.packages(id) on delete cascade,
  weight_class text not null check (weight_class in ('S', 'M', 'L', 'XL')),
  coat_type text not null check (coat_type in ('SC', 'LC')),
  price numeric(10, 2) not null check (price >= 0),
  updated_by uuid references public.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (package_id, weight_class, coat_type)
);

alter table public.package_pricing_cell_overrides enable row level security;

create policy "Authenticated users can read package price cells"
  on public.package_pricing_cell_overrides
  for select
  to authenticated
  using (true);

create policy "Superadmins can add package price cells"
  on public.package_pricing_cell_overrides
  for insert
  to authenticated
  with check (public.current_staff_role() = 'Superadmin');

create policy "Superadmins can update package price cells"
  on public.package_pricing_cell_overrides
  for update
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');

create policy "Superadmins can delete package price cells"
  on public.package_pricing_cell_overrides
  for delete
  to authenticated
  using (public.current_staff_role() = 'Superadmin');

create trigger trg_archive_deleted_row
  after delete on public.package_pricing_cell_overrides
  for each row execute function public.archive_deleted_row();

-- ---------------------------------------------------------------------------
-- 3. use_pricing_matrix comments
-- ---------------------------------------------------------------------------
-- The "always ignored for a Cat" rule was replaced by pet_type_price_overrides
-- (20260912192), and the switch is now Superadmin-only.

comment on column public.services.use_pricing_matrix is
  'Grooming-only: whether this service''s price varies by the pet''s weight_class/coat_type. Cells come from pricing_configuration, overridden per cell by service_pricing_cell_overrides. Superadmin-only.';
comment on column public.packages.use_pricing_matrix is
  'Whether this package''s price varies by the pet''s weight_class/coat_type. Cells come from pricing_configuration applied to the bundled price, overridden per cell by package_pricing_cell_overrides. Superadmin-only.';
