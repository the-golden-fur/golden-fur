-- Custom change (package cat price): a package can carry one separate price
-- for cats, set in Config > Packages.
--
-- Until now a cat's price for ANY package came from the pet type's fixed
-- price (pet_type_price_overrides, 20260912192 - the seeded PHP 800 "Cat"
-- row), the same figure whichever package it was. cat_price lets one package
-- say what it costs for a cat. When set it wins for a Cat pet, ahead of that
-- pet-type fixed price and of the weight x coat grid; NULL (the default)
-- leaves cats priced exactly as before.
--
-- One price, not per branch and not per size or coat - "one separate price
-- for cat". No new table, so no new RLS policy or archive trigger.

alter table public.packages
  add column cat_price numeric(10, 2)
    check (cat_price is null or cat_price >= 0);

comment on column public.packages.cat_price is
  'What this package costs for a Cat pet, in place of the pet type''s fixed price and the weight x coat grid. NULL = cats are priced like any other pet type (pet_type_price_overrides, then the grid/bundled price).';
