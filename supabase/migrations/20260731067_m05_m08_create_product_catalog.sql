-- M05/M08 unification (Sprint 5 Epic A, #82 extended scope): food_catalog
-- and medication_catalog (migration 20260727054) are structurally identical
-- admin-managed name/price/is_active lists, and M08's Miscellaneous Sale
-- (#85) needs the exact same shape - a priced, admin-managed item a cashier
-- can pick off a list. Rather than build a third parallel catalog, this
-- migration merges both into one product_catalog table, differentiated by
-- category (what kind of item) and service_scope (which feature surfaces
-- it) - both plain text, not enums, matching the project's own established
-- convention for an extensible category/lifecycle field that a later sprint
-- may need to add values to without a schema migration (see
-- transaction_line_items.line_item_type in the next migration, and
-- hotel_stays.status/daycare_sessions.status precedent). Documented values
-- as of this migration: category in ('food', 'medication', 'misc_retail'),
-- service_scope in ('hotel', 'general').

create table public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  service_scope text not null,
  -- Same "every catalog row must have a price to ever be selected" rule
  -- food_catalog/medication_catalog already established - see their own
  -- migration's comment.
  price numeric(10, 2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Uniqueness is scoped to (name, category) rather than name alone, so a
  -- hotel "Dry Kibble" and a hypothetical misc-retail "Dry Kibble" bag can
  -- coexist as distinct catalog entries.
  unique (name, category)
);

-- Backfill preserves the original row ids so care_feeding_instructions.
-- food_catalog_id / care_medication_instructions.medication_catalog_id keep
-- resolving to the same logical item without a data migration on those
-- tables - only their FK target changes below.
insert into public.product_catalog
  (id, name, category, service_scope, price, is_active, created_at, updated_at)
select id, name, 'food', 'hotel', price, is_active, created_at, updated_at
from public.food_catalog;

insert into public.product_catalog
  (id, name, category, service_scope, price, is_active, created_at, updated_at)
select id, name, 'medication', 'hotel', price, is_active, created_at, updated_at
from public.medication_catalog;

-- Repoint the existing FKs at product_catalog. Column names are kept as-is
-- (food_catalog_id / medication_catalog_id) - they describe the domain
-- concept being referenced ("which food/medication was selected for this
-- instruction"), not the storage table, the same way assigned_groomer_id
-- names a role rather than the staff_profiles table it points to.
alter table public.care_feeding_instructions
  drop constraint care_feeding_instructions_food_catalog_id_fkey;

alter table public.care_feeding_instructions
  add constraint care_feeding_instructions_food_catalog_id_fkey
  foreign key (food_catalog_id) references public.product_catalog(id);

alter table public.care_medication_instructions
  drop constraint care_medication_instructions_medication_catalog_id_fkey;

alter table public.care_medication_instructions
  add constraint care_medication_instructions_medication_catalog_id_fkey
  foreign key (medication_catalog_id) references public.product_catalog(id);

drop table public.food_catalog;
drop table public.medication_catalog;

-- RLS: same two-tier shape food_catalog/medication_catalog already used
-- (open SELECT to any authenticated user, Admin/Superadmin-only write) via
-- the existing current_staff_role() helper.
alter table public.product_catalog enable row level security;

create policy "Any authenticated user can read the product catalog"
  on public.product_catalog
  for select
  to authenticated
  using (true);

create policy "Admins and superadmins can insert product catalog items"
  on public.product_catalog
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can update product catalog items"
  on public.product_catalog
  for update
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can delete product catalog items"
  on public.product_catalog
  for delete
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'));
