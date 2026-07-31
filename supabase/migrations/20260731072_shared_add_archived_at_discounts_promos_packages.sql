-- Extends the archive workflow (20260731071: Products/Staff/Customers/Pets)
-- to Discounts, Promos, and Packages - same deactivate-first -> archive
-- (soft, via archived_at) -> hard-delete (irreversible) flow, same nullable
-- timestamp shape rather than a boolean flag.
--
-- No RLS changes, same rationale as 20260731071: every write path that
-- enforces or filters on archived_at goes through the server's service-role
-- Supabase client, which already bypasses RLS entirely.

alter table public.discounts
  add column archived_at timestamptz;

alter table public.promos
  add column archived_at timestamptz;

alter table public.packages
  add column archived_at timestamptz;

create index discounts_archived_at_idx
  on public.discounts (archived_at)
  where archived_at is not null;

create index promos_archived_at_idx
  on public.promos (archived_at)
  where archived_at is not null;

create index packages_archived_at_idx
  on public.packages (archived_at)
  where archived_at is not null;
