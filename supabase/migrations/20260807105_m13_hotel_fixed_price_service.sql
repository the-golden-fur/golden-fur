-- Custom change (Hotel fixed pricing): Hotel used to be four services, one
-- per cage size ("Hotel Stay - Small/Medium/Large/XL Cage", PHP 500-1000) -
-- the request is "hotel and daycare will have exactly 1 service, fixed
-- price, regardless of cage size chosen" (matches the pricing board: a
-- single "Overnight (Aircon Room)" line). Cage size becomes a pure
-- capacity/assignment concern from here on (which physical cage a pet gets
-- at check-in), never a price input - Daycare already worked this way (one
-- service, 20260715034).
--
-- The four cage-size services are soft-disabled, not deleted -
-- booking_items.service_id is ON DELETE RESTRICT and historical
-- bookings/seed data may already reference them (services.is_active is
-- exactly this table's existing "soft-disable instead of delete" mechanism,
-- per its own column comment).
--
-- min_nights_for_free_package/free_package_name back the "5+ nights ->
-- free Golden Package" board condition. free_package_name is a name match
-- against public.packages, not a direct FK id: packages are seeded one row
-- per branch (module-3-maintenance seed, "Makati and Southwoods each get
-- their own row even for a same-named package"), while services are
-- branch-independent - a single Hotel services row can't hold one FK that
-- correctly points at both branches' own "Golden Package" row at once, so
-- the free package is resolved by (branch_id, name) at the point it's
-- awarded (booking.service.ts) instead.

alter table public.services
  add column min_nights_for_free_package integer
    check (min_nights_for_free_package > 0),
  add column free_package_name text;

comment on column public.services.min_nights_for_free_package is
  'Hotel-only: booking this many nights or more on this service auto-awards free_package_name as a zero-priced line item. NULL = no free-package condition.';
comment on column public.services.free_package_name is
  'Hotel-only: matched against packages.name at the booking''s own branch_id when min_nights_for_free_package is met (packages are branch-scoped; this service row is not).';

update public.services
set is_active = false
where id in (
  'a1300000-0000-4000-a000-000000000012',  -- Hotel Stay - Small Cage
  'a1300000-0000-4000-a000-000000000013',  -- Hotel Stay - Medium Cage
  'a1300000-0000-4000-a000-000000000014',  -- Hotel Stay - Large Cage
  'a1300000-0000-4000-a000-000000000015'   -- Hotel Stay - XL Cage
);

-- Bug fix (found while chasing "the overnight stay hotel service is not
-- showing" in the booking flow): this insert originally reused id
-- ...-022, which migration 20260802074 had already assigned to the
-- unrelated "Initial Assessment" Misc service. `on conflict (id) do
-- nothing` silently no-op'd the whole insert, so the Hotel service never
-- actually existed - id ...-024 is the next free slot (see
-- 20260807105-024 below; ...-023 is "Reassessment").
insert into public.services
  (id, category, name, base_price, duration_minutes, min_nights_for_free_package, free_package_name)
values (
  'a1300000-0000-4000-a000-000000000024',
  'Hotel',
  'Overnight Stay (Aircon Room)',
  850.00,
  1440,
  5,
  'Golden Package'
)
on conflict (id) do nothing;

-- service_branch_availability for the new service, mirroring
-- module-3-maintenance's seed (every base service available at every
-- branch by default) - a migration-time insert since it needs
-- branches.id, which exist by the time this custom-change migration runs
-- (unlike the original from-scratch seed migration, this is not a fresh
-- `supabase db reset`'s very first pass). On a fresh reset this is a
-- harmless no-op (branches don't exist yet - migrations run before
-- seeds); module-3-maintenance's seed picks up every 'a1300000-%'
-- service, including this one, once branches do exist.
insert into public.service_branch_availability (service_id, branch_id, is_available)
select 'a1300000-0000-4000-a000-000000000024', b.id, true
from public.branches as b
on conflict (service_id, branch_id) do nothing;
