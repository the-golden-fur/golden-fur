-- Archive workflow: adds archived_at (nullable timestamp, not a boolean) to
-- the four entities getting the deactivate-first -> archive -> hard-delete
-- flow (Products, Staff, Customers, Pets). A timestamp rather than a flag
-- lets the new archive list pages sort by "archived on", matching the
-- existing created_at/updated_at timestamp convention on these tables
-- rather than introducing a new boolean-flag shape.
--
-- No RLS changes: every write path that needs to enforce or filter on
-- archived_at goes through the server's service-role Supabase client, which
-- already bypasses RLS entirely (see customer_profiles_staff_rls.sql's own
-- note - RLS here is defense-in-depth, not the enforcement layer). Normal
-- list queries and the new archive-list queries both filter explicitly on
-- archived_at in application code (productCatalog.service.ts et al.), so no
-- new policy is required for staff-facing access. Existing customer-self
-- SELECT policies on customer_profiles/pets are left as-is - a customer
-- seeing their own archived record via direct client access is harmless.

alter table public.product_catalog
  add column archived_at timestamptz;

alter table public.staff_profiles
  add column archived_at timestamptz;

alter table public.customer_profiles
  add column archived_at timestamptz;

alter table public.pets
  add column archived_at timestamptz;

create index product_catalog_archived_at_idx
  on public.product_catalog (archived_at)
  where archived_at is not null;

create index staff_profiles_archived_at_idx
  on public.staff_profiles (archived_at)
  where archived_at is not null;

create index customer_profiles_archived_at_idx
  on public.customer_profiles (archived_at)
  where archived_at is not null;

create index pets_archived_at_idx
  on public.pets (archived_at)
  where archived_at is not null;
