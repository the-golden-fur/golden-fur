-- Customers now own every food/medication catalog type they see (no more
-- "provided by the hotel" global-reference concept, see
-- module-4-hotel.seed.ts/.sql) - backfill any pre-existing global
-- (owner_customer_id IS NULL) hotel food/medication rows onto
-- customer1@goldenfur.com so they match the new seed convention instead of
-- being orphaned duplicates once the seed is re-run.
--
-- Reassigns in place (rather than delete+reinsert) so any existing
-- references to these product_catalog ids (e.g. saved care instructions)
-- keep pointing at the same row.

update public.product_catalog
set owner_customer_id = (
  select id from public.customer_profiles where account_email = 'customer1@goldenfur.com'
)
where owner_customer_id is null
  and category in ('food', 'medication')
  and service_scope = 'hotel'
  and exists (
    select 1 from public.customer_profiles where account_email = 'customer1@goldenfur.com'
  );
