-- Government-mandated discounts (Senior Citizen / PWD) used to be recognised
-- by their exact NAME: checkout's eligibility gate did
-- `discount.name === 'Senior Citizen Discount'`. That made the name
-- untouchable, so the admin Discounts menu could not offer Rename on those
-- rows like it does everywhere else.
--
-- mandated_kind is the stable identity instead. The gate now reads it, so a
-- mandated discount can be renamed freely without silently dropping its
-- eligibility check (which would have applied it to every customer).
--
-- NULL for custom discounts. Backfilled from the seeded names.
--
-- No RLS changes: discounts is only written through the server's
-- service-role client, which bypasses RLS.

alter table public.discounts
  add column mandated_kind text
    check (mandated_kind in ('senior_citizen', 'pwd')),
  add constraint discounts_mandated_kind_requires_mandated
    check (mandated_kind is null or is_mandated);

update public.discounts
set mandated_kind = 'senior_citizen'
where is_mandated and name = 'Senior Citizen Discount';

update public.discounts
set mandated_kind = 'pwd'
where is_mandated and name = 'PWD Discount';
