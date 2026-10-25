-- Custom change (per-promo promo cap): the promo cap moves from a per-branch
-- setting (promo_cap_configuration) into each promo, so it can differ per
-- promo. A booking can only carry one promo, so a "combined" cap no longer
-- does anything - instead each promo's cap is the minimum order the customer
-- must reach to use it (e.g. PHP 100 off with a PHP 500 cap needs an order of
-- PHP 500 or more). Once usable, a promo applies its full amount.
--
--   promos.min_spend - the promo cap: the minimum booking subtotal needed to
--   use this promo, for any discount type. NULL = no cap (every existing
--   promo).
--
-- promo_cap_configuration is no longer read by the app but is left in place
-- (no data dropped) - a later cleanup migration can remove it.
--
-- No new table, so no new RLS policy or archive trigger.

alter table public.promos
  add column min_spend numeric(10, 2)
    check (min_spend is null or min_spend >= 0);

comment on column public.promos.min_spend is
  'Promo cap: the minimum order (booking subtotal, PHP) needed to use this promo, any discount type. NULL = no cap. Replaces the per-branch promo_cap_configuration, which is no longer read (table kept). Set in Config > Promos.';
