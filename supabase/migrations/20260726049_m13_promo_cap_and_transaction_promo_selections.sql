-- Revision Batch 1 - Epic B (#84): promo per-transaction cap replaces the
-- promos.is_exclusive exclusivity toggle, and transaction_promo_selections
-- lays the data-model groundwork for customer promo activation at checkout
-- (the checkout UI itself is M08 scope, Sprint 5 - not built yet).

create type public.cap_type_enum as enum ('percentage', 'flat');

create table public.promo_cap_configuration (
  id uuid primary key default gen_random_uuid(),
  -- NULL = the system-wide default cap; a branch-specific row overrides it,
  -- mirroring the policy_configurations pattern (migration 20260718037).
  branch_id uuid references public.branches(id),
  cap_type public.cap_type_enum not null default 'percentage',
  cap_value numeric(10, 2) not null default 20.00 check (cap_value >= 0),
  -- Nullable for the same reason as pricing_configuration.updated_by_staff_id
  -- (...047) - the default row is seeded by this migration, not a request.
  updated_by_staff_id uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now()
);

-- One row per branch, and exactly one system-wide default row - same shape
-- as policy_configurations_branch_uniq / _default_uniq.
create unique index promo_cap_configuration_branch_uniq
  on public.promo_cap_configuration(branch_id)
  where branch_id is not null;

create unique index promo_cap_configuration_default_uniq
  on public.promo_cap_configuration((true))
  where branch_id is null;

insert into public.promo_cap_configuration (branch_id) values (null);

comment on table public.promo_cap_configuration is
  'Admin/Superadmin-configurable maximum total discount value that all '
  'combined, customer-activated promos may contribute to one transaction. '
  'Replaces promos.is_exclusive - combinability is now governed globally '
  'per branch, not declared per promo.';

-- ---------------------------------------------------------------------------
-- promos.is_exclusive is dropped, not deprecated - there is no transitional
-- state where both mechanisms coexist (#84 Dev Notes).
-- ---------------------------------------------------------------------------

alter table public.promos drop column is_exclusive;

-- ---------------------------------------------------------------------------
-- transaction_promo_selections: the data-model half of customer promo
-- activation. transaction_id intentionally has NO foreign key yet - M08's
-- transactions table (Sprint 5) does not exist in this database. The
-- constraint is forward-declared here in comment form only and must be
-- added via `alter table ... add constraint ... foreign key` in the M08
-- migration that creates transactions, once it exists.
-- ---------------------------------------------------------------------------

create table public.transaction_promo_selections (
  id uuid primary key default gen_random_uuid(),
  -- FK to public.transactions(id) - added once M08 ships (Sprint 5).
  transaction_id uuid not null,
  promo_id uuid not null references public.promos(id),
  is_activated boolean not null default false,
  activated_at timestamptz,
  check (
    (is_activated and activated_at is not null)
    or (not is_activated and activated_at is null)
  )
);

create index transaction_promo_selections_transaction_id_idx
  on public.transaction_promo_selections(transaction_id);

create index transaction_promo_selections_promo_id_idx
  on public.transaction_promo_selections(promo_id);

comment on table public.transaction_promo_selections is
  'One row per eligible promo shown to a customer at checkout/booking '
  'review. Schema-only in Epic B: the checkout UI that writes is_activated '
  'is M08 scope (Sprint 5). transaction_id has no FK yet - transactions '
  'does not exist until M08 ships.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.promo_cap_configuration enable row level security;

create policy "Staff can read promo cap configuration"
  on public.promo_cap_configuration
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage promo cap configuration"
  on public.promo_cap_configuration
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

alter table public.transaction_promo_selections enable row level security;

-- Staff-only for now (Admin/Superadmin manage, all staff read) - a real
-- "owning customer can insert/toggle is_activated" policy needs to join to
-- transactions to verify ownership, and that table doesn't exist yet. Add
-- the customer-facing policy alongside M08's transactions migration rather
-- than approximating ownership checks against a table that isn't there.
create policy "Staff can read transaction promo selections"
  on public.transaction_promo_selections
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage transaction promo selections"
  on public.transaction_promo_selections
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
