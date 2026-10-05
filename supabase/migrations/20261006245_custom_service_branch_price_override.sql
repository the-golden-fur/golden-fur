-- Custom change (per-branch service price): a service is one shared row
-- across branches (service_branch_availability only toggles it on or off
-- per branch), so every branch had to charge the same price. A branch can
-- now carry its own price for a service: price_override, set by a
-- Superadmin in Config > Services. NULL (the default) means "use the
-- service's base_price", so nothing changes until one is set.
--
-- It replaces base_price only - read through servicePriceAtBranch()
-- (maintenance/utils/branchServicePrice.ts) by the booking catalog, booking
-- creation, and Daycare's "not picked up before closing" nightly rate. A
-- pet type's fixed price, the Grooming size/coat matrix and Daycare's hourly
-- fees are unaffected.
--
-- No new RLS: the table's existing policies already cover the whole row.

alter table public.service_branch_availability
  add column price_override numeric(10, 2)
    check (price_override is null or price_override >= 0);

comment on column public.service_branch_availability.price_override is
  'This branch''s own price for the service, replacing services.base_price there. NULL = use base_price. Superadmin-set (Config > Services).';

-- The request that prompted this: Hotel is PHP 500 a night at Southwoods
-- (PHP 850, the base price, everywhere else). Matched by name rather than
-- id - branch ids are environment-specific - and a no-op where either row
-- is missing.
update public.service_branch_availability as availability
set price_override = 500.00
from public.services as service, public.branches as branch
where availability.service_id = service.id
  and availability.branch_id = branch.id
  and service.category = 'Hotel'
  and service.name = 'Overnight Stay (Aircon Room)'
  and branch.name = 'Southwoods';
