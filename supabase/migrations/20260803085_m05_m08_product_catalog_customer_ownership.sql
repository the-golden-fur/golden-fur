-- Booking flow & pricing revamp (#22): staff no longer buy food/medication
-- for customers (see 20260803084), so customers now maintain their own
-- reusable food/medication "types" for future hotel bookings instead. Rather
-- than build a parallel catalog, this repurposes the existing staff-managed
-- product_catalog (already the shared shape for a named, priced, selectable
-- item) by adding an owner column: null = staff/global entry (unchanged
-- existing behavior, still Admin/Superadmin-only to write), non-null = a
-- customer's own private entry.
--
-- price stays NOT NULL (existing constraint) - customer-owned rows are never
-- billed (no staff-supplied billing exists anymore, see 20260803084), so the
-- API always writes 0 for them; the column is kept rather than made
-- nullable so misc_retail/staff rows keep their existing guarantee.

alter table public.product_catalog
  add column owner_customer_id uuid references public.customer_profiles(id);

-- Replace the blanket (name, category) uniqueness with two partial indexes:
-- global entries keep colliding with each other on (name, category), while
-- customer-owned entries only collide with their own other entries - two
-- different customers (or a customer and the global catalog) may use the
-- same food/medication name.
alter table public.product_catalog drop constraint product_catalog_name_category_key;

create unique index product_catalog_global_name_category_uniq
  on public.product_catalog (name, category)
  where owner_customer_id is null;

create unique index product_catalog_owner_name_category_uniq
  on public.product_catalog (owner_customer_id, name, category)
  where owner_customer_id is not null;

-- Customer-owned rows are restricted to food/medication for hotel bookings
-- only - customers never get a path to misc_retail (the Cashier/POS catalog
-- shares this same table, see 20260731067).
alter table public.product_catalog
  add constraint product_catalog_customer_rows_food_or_medication_hotel_only
  check (
    owner_customer_id is null
    or (category in ('food', 'medication') and service_scope = 'hotel')
  );

-- The original "Any authenticated user can read" policy (20260731067) was
-- written back when every reader was staff; it must be narrowed to staff
-- now that customers are authenticated too, otherwise its `using (true)`
-- would let any customer see every other customer's private catalog rows
-- regardless of the scoped policy added below (permissive RLS policies
-- OR together).
drop policy "Any authenticated user can read the product catalog"
  on public.product_catalog;

create policy "Staff can read the product catalog"
  on public.product_catalog
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own and global catalog entries"
  on public.product_catalog
  for select
  to authenticated
  using (owner_customer_id is null or owner_customer_id = auth.uid());

create policy "Customers can insert their own catalog entries"
  on public.product_catalog
  for insert
  to authenticated
  with check (owner_customer_id = auth.uid());

create policy "Customers can update their own catalog entries"
  on public.product_catalog
  for update
  to authenticated
  using (owner_customer_id = auth.uid())
  with check (owner_customer_id = auth.uid());

create policy "Customers can delete their own catalog entries"
  on public.product_catalog
  for delete
  to authenticated
  using (owner_customer_id = auth.uid());
