-- Revision Batch 1 - Epic B (#80): pricing_configuration (grooming size/coat
-- derivation) - replaces the manually-entered Grooming size x coat matrix
-- with one shared calculation.
--
-- Numbering note: the Guide assumed Epic A's last migration was ...031, but
-- the actual last merged migration is 20260725046, so this epic's migrations
-- are renumbered 047+ per the Guide's own Handoff State instruction (confirm
-- against supabase/migrations/ before branching further).
--
-- Design-sheet deviation: the actual Sprint 2 schema never added the 8
-- manual price_<size>_<coat> columns onto services that the Guide/Design
-- sheet assumed - it normalized that matrix into its own table,
-- service_pricing_tiers (one row per service/weight_class/coat_type,
-- migration 20260715032). That table is this epic's real "manual entry"
-- mechanism, so it - not 8 services columns - is what gets superseded here.
-- Every pre-existing tier value is logged via RAISE NOTICE before the table
-- is dropped, matching the Guide's non-destructive-drop intent.

create table public.pricing_configuration (
  id uuid primary key default gen_random_uuid(),
  size_s_multiplier numeric(5, 4) not null default 1.0000
    check (size_s_multiplier > 0),
  size_m_multiplier numeric(5, 4) not null default 1.1000
    check (size_m_multiplier > 0),
  size_l_multiplier numeric(5, 4) not null default 1.2500
    check (size_l_multiplier > 0),
  size_xl_multiplier numeric(5, 4) not null default 1.5000
    check (size_xl_multiplier > 0),
  long_coat_addon numeric(10, 2) not null default 0.00
    check (long_coat_addon >= 0),
  -- Nullable, unlike the Design sheet's NOT NULL: this table seeds its one
  -- row from a migration, which has no real requester to attribute it to.
  -- Every other created_by/updated_by column in this schema (services,
  -- packages, promos, discounts) is nullable for the same reason - matched
  -- here rather than inventing a system staff row that doesn't exist.
  updated_by_staff_id uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now()
);

-- Singleton, enforced here rather than only at the application layer - a
-- second row would silently make "the" grooming calculation ambiguous.
create unique index pricing_configuration_singleton_uniq
  on public.pricing_configuration((true));

insert into public.pricing_configuration default values;

comment on table public.pricing_configuration is
  'Singleton (Admin/Superadmin editable): the shared grooming size/coat '
  'calculation. Default multiplier values are a starting point, not a '
  'confirmed business rule - Modules-Features gives an illustrative example '
  'without specifying exact figures; flag for client/Admin review.';

-- ---------------------------------------------------------------------------
-- Log every existing service_pricing_tiers value before dropping the table,
-- so a manually-tuned figure that diverged from the new derived formula is
-- visible in the migration's output, not silently lost.
-- ---------------------------------------------------------------------------

do $$
declare
  tier record;
begin
  for tier in
    select service_id, weight_class, coat_type, price
    from public.service_pricing_tiers
    order by service_id, weight_class, coat_type
  loop
    raise notice
      'service_pricing_tiers pre-migration value: service_id=%, weight_class=%, coat_type=%, price=%',
      tier.service_id, tier.weight_class, tier.coat_type, tier.price;
  end loop;
end;
$$;

drop table public.service_pricing_tiers;

-- ---------------------------------------------------------------------------
-- RLS - same two-tier shape as every M13 table: all authenticated staff can
-- SELECT (the service form and booking price resolution both read this at
-- request time); only Admin/Superadmin can write. No DELETE policy - the
-- singleton row is edited in place, never removed.
-- ---------------------------------------------------------------------------

alter table public.pricing_configuration enable row level security;

create policy "Staff can read pricing configuration"
  on public.pricing_configuration
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage pricing configuration"
  on public.pricing_configuration
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
