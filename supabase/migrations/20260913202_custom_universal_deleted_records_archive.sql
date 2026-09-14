-- Custom change: universal "recover anything I deleted" archive. "As any
-- user, I want any record from any table I delete to be stored in an
-- archive, where I can then query (search, filter, sort, etc.) in the
-- future if I ever need to restore it." This is intentionally a durable
-- BACKSTOP behind whatever soft-delete/archive flow an entity already has
-- (products/staff/customers/pets/discounts/promos/packages all archive via
-- their own is_active/archived_at columns before a hard delete ever
-- happens) - it captures the row at the moment ANY table's DELETE actually
-- reaches Postgres, regardless of whether that table has bespoke archive
-- UI of its own.
--
-- row_data is a full to_jsonb(OLD) snapshot, so restore is a generic
-- `insert into <source_table> values row_data` (done in TypeScript -
-- Supabase's own `.insert(row_data)` already builds the right column list
-- from the object's keys, no dynamic SQL needed there) - see
-- server/src/features/recordsArchive.
--
-- deleted_by is nullable and will be NULL for the overwhelming majority of
-- deletes: the Express server's Supabase client uses the service-role key
-- (server/src/config/supabase/supabase.config.ts), which bypasses RLS and
-- has no `auth.uid()` inside this trigger - same limitation already
-- documented on activity_log.actor_staff_id (20260819136). What/when is
-- always captured reliably; who is best-effort only.
create table public.deleted_records_archive (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  -- The deleted row's own `id` column when it has one (the overwhelming
  -- majority of tables in this schema do) - null for the handful of
  -- composite-key join tables, which is fine since row_data still has
  -- everything needed to restore or to identify the row in the UI.
  record_id text,
  row_data jsonb not null,
  -- Generated, not just cast at query time, so a plain `ilike` filter (no
  -- pg_trgm/tsvector setup needed at this project's scale) can search
  -- every field of the deleted row through PostgREST.
  search_text text generated always as (row_data::text) stored,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references auth.users(id) on delete set null
);

create index deleted_records_archive_source_table_idx
  on public.deleted_records_archive (source_table);
create index deleted_records_archive_deleted_at_idx
  on public.deleted_records_archive (deleted_at desc);

alter table public.deleted_records_archive enable row level security;

create policy "Admins and superadmins can read the deleted records archive"
  on public.deleted_records_archive
  for select
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'));

-- No insert/update/delete policy for `authenticated` - every row is written
-- by the trigger below (security definer, runs as the migration role, which
-- owns this table and so bypasses its RLS), and restore/purge both go
-- through the server's own service-role client, same as every other
-- service-role-only table in this schema (activity_log, care_log_entries,
-- ...).

create or replace function public.archive_deleted_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.deleted_records_archive (source_table, record_id, row_data, deleted_by)
  values (
    TG_TABLE_NAME,
    to_jsonb(OLD) ->> 'id',
    to_jsonb(OLD),
    auth.uid()
  );
  return OLD;
end;
$$;

-- Attaches the capture trigger to every table that exists in `public` right
-- now - the only way to cover "any table" without a migration per table.
-- Deliberately excludes only the archive table itself (nothing else is
-- exempt - a junction/join-table row is still a "record" someone might want
-- back). A table created by a FUTURE migration does NOT get this
-- automatically - see the new AGENTS.md convention this change adds:
-- every new `create table` migration must also attach this trigger, the
-- same way every new table already gets its own RLS policy.
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename <> 'deleted_records_archive'
  loop
    execute format(
      'drop trigger if exists trg_archive_deleted_row on public.%I',
      r.tablename
    );
    execute format(
      'create trigger trg_archive_deleted_row after delete on public.%I for each row execute function public.archive_deleted_row()',
      r.tablename
    );
  end loop;
end $$;
