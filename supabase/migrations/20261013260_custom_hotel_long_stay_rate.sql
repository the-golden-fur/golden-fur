-- Custom change (Hotel long-stay rate): booking the Hotel service for a long
-- stay is cheaper per night, automatically - no second service to pick.
-- "Overnight Stay (Aircon Room)" is PHP 850 a night in Makati and PHP 500 in
-- Southwoods; booked for 5 nights or more it is PHP 750 / PHP 450 a night
-- instead, and (as before, 20260807105) the pet gets the free package.
--
-- The threshold is the service's existing min_nights_for_free_package, so the
-- cheaper rate and the free package always switch on together - one "long
-- stay" setting rather than two that could drift apart.
--
--   services.long_stay_nightly_price - the per-night price once that many
--   nights are booked. NULL = no long-stay rate (every existing service).
--
--   service_branch_availability.long_stay_price_override - a branch's own
--   long-stay price, exactly as price_override (20261006245) is a branch's
--   own regular price. NULL = use the service's long_stay_nightly_price.
--
-- Only the nights booked up front get the rate. A night added afterwards (a
-- stay extension, a late checkout) is charged the service's regular price -
-- that needs no column of its own, it is just price_override / base_price.
--
-- No new table, so no new RLS policy or archive trigger.

alter table public.services
  add column long_stay_nightly_price numeric(10, 2)
    check (long_stay_nightly_price is null or long_stay_nightly_price >= 0);

alter table public.service_branch_availability
  add column long_stay_price_override numeric(10, 2)
    check (long_stay_price_override is null or long_stay_price_override >= 0);

comment on column public.services.long_stay_nightly_price is
  'Hotel-only: the per-night price when min_nights_for_free_package or more nights are booked. NULL = no long-stay rate. Superadmin-set (Config > Services).';
comment on column public.service_branch_availability.long_stay_price_override is
  'This branch''s own long-stay nightly price for the service, replacing services.long_stay_nightly_price there. NULL = use long_stay_nightly_price. Superadmin-set (Config > Services).';

update public.services
set long_stay_nightly_price = 750.00
where id = 'a1300000-0000-4000-a000-000000000024';  -- Overnight Stay (Aircon Room)

-- Southwoods' own PHP 450, matched by name rather than id - branch ids are
-- environment-specific (same as 20261006245) - and a no-op where the row is
-- missing. On a fresh `supabase db reset` these rows don't exist yet when
-- migrations run; m13-maintenance's seed creates the row with this price.
update public.service_branch_availability as availability
set long_stay_price_override = 450.00
from public.branches as branch
where availability.branch_id = branch.id
  and availability.service_id = 'a1300000-0000-4000-a000-000000000024'
  and branch.name = 'Southwoods';
