-- Branches gets the same two-step "deactivate, then archive" pattern
-- already used for Products/Staff/Customers/Pets/Discounts/Promos/Packages
-- (20260731071/072) - unlike those tables, branches never had an is_active
-- column at all (no deactivate concept existed for it before this), so
-- both columns are added fresh here in one migration rather than just
-- extending an existing is_active with archived_at.
--
-- No RLS changes, same rationale as 20260731071/072: every write path that
-- enforces or filters on archived_at/is_active goes through the server's
-- service-role Supabase client, which already bypasses RLS entirely.

alter table public.branches
  add column is_active boolean not null default true,
  add column archived_at timestamptz;

create index branches_archived_at_idx
  on public.branches (archived_at)
  where archived_at is not null;
