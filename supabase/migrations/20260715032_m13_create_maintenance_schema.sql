-- Sprint 2 Epic A (#39): M13 Maintenance schema - service_category enum,
-- services, service_pricing_tiers, service_branch_availability, packages,
-- package_services, promos, promo_scope, plus the shared discount_type enum
-- (declared here, reused by M12's discounts table in the next migration).
--
-- Numbering note: the Epic A Guide assumed Sprint 1 ended at ...020; the
-- actual last merged migration is 20260714031, so this epic's migrations are
-- renumbered 032-034 per the Guide's own Handoff State instruction.
--
-- service_category is declared here in M13 even though Sprint 2 Epic B's
-- bookings table will also use it - Epic B must reuse this enum rather than
-- declaring its own, so a booking's category can never drift from a real
-- services.category value.

create type public.service_category as enum (
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary'
);

-- Shared by M13 promos and M12 discounts - both express the same
-- percentage-vs-flat shape.
create type public.discount_type as enum ('Percentage', 'Flat');

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category public.service_category not null,
  name text not null,
  base_price numeric(10, 2) not null check (base_price >= 0),
  -- Applicable to Daycare (per-hour block) and Hotel (per-night); NULL for
  -- Grooming/Veterinary, which are slot-based via get_staff_availability().
  duration_minutes integer check (duration_minutes > 0),
  -- Soft-disable instead of delete - historical bookings/transactions may
  -- reference this row from Sprint 2 Epic B onward.
  is_active boolean not null default true,
  created_by uuid references public.staff_profiles(id),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index services_category_idx on public.services(category);

-- ---------------------------------------------------------------------------
-- service_pricing_tiers (Grooming size-coat matrix)
-- ---------------------------------------------------------------------------
-- Only meaningful when services.category = 'Grooming'; enforced at the
-- application layer (#40), since a Postgres CHECK cannot easily reference
-- another table's column.
--
-- weight_class/coat_type reuse the same vocabulary as M02 pets
-- (pet_weight_class: S/M/L/XL; pet_coat_type: SC/LC) but as text + CHECK
-- rather than an FK/enum reference, since M02's enums are owned by a
-- different module. Note: the Design sheet's prose lists four coat values
-- ("Short, Medium, Long, Double-coat") while also saying "matches M02
-- pets.coat_type" - M02's actual merged enum is SC/LC (Short Coat/Long
-- Coat), and the M13 flowchart says "S/M/L/XL x Short Coat/Long Coat", so
-- SC/LC is what "matches" resolves to here.

create table public.service_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  weight_class text not null check (weight_class in ('S', 'M', 'L', 'XL')),
  coat_type text not null check (coat_type in ('SC', 'LC')),
  price numeric(10, 2) not null check (price >= 0),
  -- One price per (service, size, coat) cell; also the upsert conflict
  -- target for #40's partial tier updates.
  unique (service_id, weight_class, coat_type)
);

create index service_pricing_tiers_service_id_idx
  on public.service_pricing_tiers(service_id);

-- ---------------------------------------------------------------------------
-- service_branch_availability
-- ---------------------------------------------------------------------------
-- One row per (service, branch) pair. The 'branch availability toggle' from
-- Modules-Features - lets Southwoods disable a Makati-only offering (or vice
-- versa) without deleting the service.

create table public.service_branch_availability (
  service_id uuid not null references public.services(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  is_available boolean not null default true,
  primary key (service_id, branch_id)
);

-- ---------------------------------------------------------------------------
-- packages
-- ---------------------------------------------------------------------------
-- Packages are created per branch (panel comment MA22) - not shared rows
-- with a branch-toggle like services; Makati and Southwoods each get their
-- own row even for a same-named package.

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  name text not null,
  -- May differ from the sum of included services' individual prices - that
  -- is the point of a package; no validation ties the two together.
  bundled_price numeric(10, 2) not null check (bundled_price >= 0),
  is_active boolean not null default true,
  created_by uuid references public.staff_profiles(id),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index packages_branch_id_idx on public.packages(branch_id);

create table public.package_services (
  package_id uuid not null references public.packages(id) on delete cascade,
  -- RESTRICT (not CASCADE): deleting a service that is still bundled into a
  -- package must fail loudly rather than silently shrink the package; the
  -- Admin must deactivate/unbundle first. Services are soft-deleted in
  -- normal operation (#40), so this only guards direct hard DELETEs.
  service_id uuid not null references public.services(id) on delete restrict,
  primary key (package_id, service_id)
);

-- ---------------------------------------------------------------------------
-- promos
-- ---------------------------------------------------------------------------

create table public.promos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- NULL dates = condition-based promo (see condition_note); date-bounded
  -- promos carry both dates. end_date drives automatic deactivation (#42).
  start_date date,
  end_date date,
  -- Free-text description of a non-date condition (e.g. 'first booking of
  -- the month'). Sprint 2 stores this for admin reference only - it is not
  -- machine-evaluated (see Guide Out of Scope).
  condition_note text,
  discount_type public.discount_type not null,
  value numeric(10, 2) not null check (value >= 0),
  scope_type text not null check (scope_type in ('all_services', 'specific')),
  branch_scope text not null
    check (branch_scope in ('makati', 'southwoods', 'both')),
  -- When true, cannot be stacked with any other active promo on the same
  -- line item; false (default) permits stacking, per Modules-Features.
  is_exclusive boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.staff_profiles(id),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

-- promo_scope: the Design sheet describes a composite PK over
-- (promo_id, service_id, package_id), but Postgres primary-key columns
-- cannot be nullable and exactly one of service_id/package_id is NULL per
-- row - so this uses a surrogate id plus partial unique indexes, which
-- enforce the same "no duplicate scope target per promo" guarantee.

create table public.promo_scope (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promos(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  package_id uuid references public.packages(id) on delete cascade,
  -- Exactly one of service_id/package_id per row (#39 AC-4) - enforced here
  -- in SQL, not only at the application layer.
  check (num_nonnulls(service_id, package_id) = 1)
);

create unique index promo_scope_promo_service_uniq
  on public.promo_scope(promo_id, service_id)
  where service_id is not null;

create unique index promo_scope_promo_package_uniq
  on public.promo_scope(promo_id, package_id)
  where package_id is not null;

create index promo_scope_promo_id_idx on public.promo_scope(promo_id);

-- ---------------------------------------------------------------------------
-- Promo expiry (Issue #42's DB piece, shipped with the schema)
-- ---------------------------------------------------------------------------
-- Sets is_active = false on any date-bounded promo whose end_date has
-- passed. Condition-based promos (end_date IS NULL) are explicitly exempt -
-- never auto-deactivate them. Returns the number of promos deactivated.
--
-- SECURITY DEFINER so a pg_cron invocation (which runs as the scheduling
-- role) and the server's RPC call both work regardless of RLS.

create or replace function public.deactivate_expired_promos()
returns integer
language sql
security definer
set search_path = public
as $$
  with deactivated as (
    update public.promos
    set is_active = false, updated_at = now()
    where is_active = true
      and end_date is not null
      and end_date < current_date
    returning 1
  )
  select count(*)::integer from deactivated;
$$;

revoke all on function public.deactivate_expired_promos() from public;
grant execute on function public.deactivate_expired_promos() to authenticated;
grant execute on function public.deactivate_expired_promos() to service_role;

-- Preferred mechanism (Guide #42): a pg_cron daily job at 00:05. pg_cron
-- availability is an Open Item, so schedule it only if the extension is
-- already installed; otherwise the application-level scheduler in
-- server/src/features/maintenance/jobs/promoExpiry.job.ts is the fallback,
-- and every promos GET also filters expired rows defensively at read time.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'deactivate-expired-promos',
      '5 0 * * *',
      'select public.deactivate_expired_promos()'
    );
  else
    raise notice
      'pg_cron not installed - promo expiry relies on the application-level scheduler and read-time filtering';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS - same two-tier shape used throughout the project: all authenticated
-- staff can SELECT; only Admin/Superadmin (via the existing
-- current_staff_role() helper from Epic A-1) can INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------------

alter table public.services enable row level security;
alter table public.service_pricing_tiers enable row level security;
alter table public.service_branch_availability enable row level security;
alter table public.packages enable row level security;
alter table public.package_services enable row level security;
alter table public.promos enable row level security;
alter table public.promo_scope enable row level security;

create policy "Staff can read services"
  on public.services
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage services"
  on public.services
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Staff can read service pricing tiers"
  on public.service_pricing_tiers
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage service pricing tiers"
  on public.service_pricing_tiers
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Staff can read service branch availability"
  on public.service_branch_availability
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage service branch availability"
  on public.service_branch_availability
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Staff can read packages"
  on public.packages
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage packages"
  on public.packages
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Staff can read package services"
  on public.package_services
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage package services"
  on public.package_services
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Staff can read promos"
  on public.promos
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage promos"
  on public.promos
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Staff can read promo scope"
  on public.promo_scope
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage promo scope"
  on public.promo_scope
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
