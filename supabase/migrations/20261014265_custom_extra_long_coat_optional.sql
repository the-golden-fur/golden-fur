-- Custom change (optional Extra Long Coat): 20261013261 gave every weight x
-- coat priced Grooming service and package an Extra Long Coat (XLC) column,
-- but not every one offers an XLC price. A Superadmin now switches it on
-- per service / package.
--
-- Off (the default, for every existing row too): the item has no XLC price
-- at all - the API leaves its XLC cells out, so no screen shows them - and
-- an XLC pet is charged the item's Long Coat price for its size.
--
-- Turning it off never deletes anything: an XLC cell a Superadmin set
-- (service/package_pricing_cell_overrides) stays put and is back the moment
-- the switch is turned on again.
--
-- Existing columns on existing tables only, so no new RLS policy or archive
-- trigger.

alter table public.services
  add column has_extra_long_coat boolean not null default false;

alter table public.packages
  add column has_extra_long_coat boolean not null default false;

comment on column public.services.has_extra_long_coat is
  'Superadmin-only: whether this service has Extra Long Coat (XLC) prices. '
  'Off = no XLC cells; an XLC pet pays the Long Coat price for its size.';

comment on column public.packages.has_extra_long_coat is
  'Superadmin-only: whether this package has Extra Long Coat (XLC) prices. '
  'Off = no XLC cells; an XLC pet pays the Long Coat price for its size.';
