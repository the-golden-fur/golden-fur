-- Sprint 2 Epic A (#39): M12 Discounts schema. Split from ...032 for module
-- clarity even though both ship in Issue #39. Depends on the discount_type
-- and service_category enums from ...032, so it must run after it.
--
-- Discounts are standing, indefinite reductions (Senior Citizen/PWD plus
-- admin-defined custom ones) - the Discount module does not apply time
-- conditions; that is the domain of M13 promos. Configured per branch
-- (mirrors packages.branch_id rather than a branch-toggle junction).

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  name text not null,
  -- true for the two predefined government-mandated types (Senior Citizen,
  -- PWD) seeded in #44. Informational at the schema level - mandated rows
  -- use the same CRUD path as custom ones, but the application layer (#43)
  -- rejects renaming them or changing this flag.
  is_mandated boolean not null default false,
  discount_type public.discount_type not null,
  value numeric(10, 2) not null check (value >= 0),
  -- Three mutually exclusive scope shapes, so a single discount (e.g. PWD)
  -- can target one service, one package, or an entire category ('all
  -- Veterinary services' per panel comment MA29) without one row per
  -- service. Multi-scope (a junction table like promo_scope) is a flagged
  -- Open Item, deliberately not built this epic.
  scope_type text not null check (scope_type in ('service', 'package', 'category')),
  scope_service_id uuid references public.services(id),
  scope_package_id uuid references public.packages(id),
  scope_category public.service_category,
  -- Inactive by default per Modules-Features ('production-ready but
  -- switched off by default') - an explicit Admin action is required to
  -- enable any discount, mandated or custom.
  is_active boolean not null default false,
  created_by uuid references public.staff_profiles(id),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one scope column set, and it must match scope_type - the
  -- promo_scope exactly-one-of pattern, written directly as a CHECK here
  -- (no junction table needed since a discount targets one scope at a time).
  constraint discounts_scope_matches_type check (
    (
      scope_type = 'service'
      and scope_service_id is not null
      and scope_package_id is null
      and scope_category is null
    )
    or (
      scope_type = 'package'
      and scope_package_id is not null
      and scope_service_id is null
      and scope_category is null
    )
    or (
      scope_type = 'category'
      and scope_category is not null
      and scope_service_id is null
      and scope_package_id is null
    )
  )
);

create index discounts_branch_id_idx on public.discounts(branch_id);

-- Same two-tier RLS shape as every table in this epic: all authenticated
-- staff SELECT, Admin/Superadmin write, via current_staff_role().

alter table public.discounts enable row level security;

create policy "Staff can read discounts"
  on public.discounts
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage discounts"
  on public.discounts
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
