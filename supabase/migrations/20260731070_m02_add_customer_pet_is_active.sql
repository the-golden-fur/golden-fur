-- Archive workflow (deactivate-first CRUD safety): customer_profiles and
-- pets have never had a soft-disable flag, unlike staff_profiles/
-- product_catalog which already use is_active for the same "deactivate
-- before you can touch it further" pattern. Adding it here so both entities
-- can join the shared deactivate -> archive -> hard-delete flow the other
-- two entities already partially support.

alter table public.customer_profiles
  add column is_active boolean not null default true;

alter table public.pets
  add column is_active boolean not null default true;
