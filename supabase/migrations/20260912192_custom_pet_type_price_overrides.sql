-- Custom change: per-branch fixed-price override by pet type. Companion to
-- 20260912191 (pet_types admin CRUD) - the actual point of this pair of
-- migrations is this table's seed row: a Cat's price for every service and
-- package is a flat 800 PHP by default, overriding whatever that
-- service/package's own base_price or weight/coat pricing matrix would
-- otherwise compute (booking.service.ts's resolveServicePrice /
-- resolvePackagePrice is expected to consult this table - not touched here).
--
-- Mirrors policy_configurations' (20260718037) branch_id-nullable-default
-- pattern (NULL = system-wide default, a branch-specific row overrides it),
-- but needs one row per (pet_type, branch) pair rather than one row per
-- branch, so it uses two partial unique indexes (one scoped to the default
-- row, one scoped to per-branch rows) instead of policy_configurations'
-- single default/branch pair of indexes.

create table public.pet_type_price_overrides (
  id uuid primary key default gen_random_uuid(),
  pet_type text not null references public.pet_types(key),
  -- NULL = the system-wide default row; a branch-specific row overrides it.
  branch_id uuid references public.branches(id),
  fixed_price numeric(10, 2) not null check (fixed_price >= 0),
  created_by uuid references public.staff_profiles(id),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One system-wide default row and one branch-specific row per pet type.
create unique index pet_type_price_overrides_default_uniq
  on public.pet_type_price_overrides(pet_type)
  where branch_id is null;

create unique index pet_type_price_overrides_branch_uniq
  on public.pet_type_price_overrides(pet_type, branch_id)
  where branch_id is not null;

-- RLS: all authenticated staff (and the server-side booking flow, which uses
-- the service-role client) can read; only Admin/Superadmin can write - same
-- shape as policy_configurations' own two policies. Customers never read
-- this table directly - pricing is resolved server-side.

alter table public.pet_type_price_overrides enable row level security;

create policy "Staff can read pet type price overrides"
  on public.pet_type_price_overrides
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage pet type price overrides"
  on public.pet_type_price_overrides
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

-- Seed the system-wide default: a Cat's fixed price is 800 PHP for all
-- services and packages, regardless of that service/package's own
-- base_price/pricing matrix.
insert into public.pet_type_price_overrides (pet_type, fixed_price) values
  ('Cat', 800.00);
