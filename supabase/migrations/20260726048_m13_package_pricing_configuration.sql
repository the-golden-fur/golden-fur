-- Revision Batch 1 - Epic B (#82): package_pricing_configuration - replaces
-- the manually-typed packages.bundled_price column with a derived
-- calculation (sum of included services' base_price, minus a configurable
-- bundle discount percentage). Parallel structure to ...047's
-- pricing_configuration, scoped to package pricing instead of the grooming
-- matrix.

create table public.package_pricing_configuration (
  id uuid primary key default gen_random_uuid(),
  bundle_discount_percentage numeric(5, 4) not null default 0.1000
    check (bundle_discount_percentage >= 0 and bundle_discount_percentage <= 1),
  -- Nullable for the same reason as pricing_configuration.updated_by_staff_id
  -- (...047) - this singleton row is seeded by the migration itself.
  updated_by_staff_id uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now()
);

create unique index package_pricing_configuration_singleton_uniq
  on public.package_pricing_configuration((true));

insert into public.package_pricing_configuration default values;

comment on table public.package_pricing_configuration is
  'Singleton (Admin/Superadmin editable): the shared package bundled-price '
  'calculation. bundle_discount_percentage is a fraction (0.10 = 10% off '
  'the sum of included services'' base_price).';

-- ---------------------------------------------------------------------------
-- Log every existing packages.bundled_price value before dropping the
-- column, so a manually-tuned figure that diverged from the new derived
-- formula is visible in the migration's output, not silently lost.
-- ---------------------------------------------------------------------------

do $$
declare
  pkg record;
begin
  for pkg in
    select id, name, bundled_price
    from public.packages
    order by id
  loop
    raise notice
      'packages pre-migration bundled_price: id=%, name=%, bundled_price=%',
      pkg.id, pkg.name, pkg.bundled_price;
  end loop;
end;
$$;

alter table public.packages drop column bundled_price;

-- ---------------------------------------------------------------------------
-- RLS - same two-tier shape as every M13 table.
-- ---------------------------------------------------------------------------

alter table public.package_pricing_configuration enable row level security;

create policy "Staff can read package pricing configuration"
  on public.package_pricing_configuration
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage package pricing configuration"
  on public.package_pricing_configuration
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
