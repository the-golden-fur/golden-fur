-- Sprint 4 Epic A (#74): M05 daily Care Log schema - care_log_entries.
-- Depends on #73 (the three care instruction tables).

create table public.care_log_entries (
  id uuid primary key default gen_random_uuid(),
  hotel_stay_id uuid not null references public.hotel_stays(id) on delete cascade,
  -- Plain text tag identifying which instruction table this entry was
  -- generated from - not a polymorphic FK across three tables (#74 dev
  -- notes: the only consumer is display grouping on the checklist).
  care_type text not null check (care_type in ('Feeding', 'Walking', 'Medication')),
  scheduled_date date not null,
  description text not null,
  -- Server-set exclusively by the completion RPC/service (#76) using the
  -- database's own clock (now()) - never accepted as a request-body value.
  -- This is the concrete mechanism behind "cannot be backdated".
  completed_at timestamptz,
  completed_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create index care_log_entries_hotel_stay_id_idx on public.care_log_entries(hotel_stay_id);
create index care_log_entries_scheduled_date_idx on public.care_log_entries(scheduled_date);
create index care_log_entries_uncompleted_idx
  on public.care_log_entries(scheduled_date)
  where completed_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Pet Assistant may only SELECT rows for stays at their own branch - no
-- INSERT/UPDATE/DELETE grant exists for this role at all. Marking an entry
-- complete goes through careLogCompletion.service.ts's service-role client
-- (#76), which forces completed_at/completed_by server-side; RLS never
-- grants a raw column-level UPDATE path for this role, matching the "via
-- the completion RPC, not a raw row UPDATE" design.
--
-- Receptionist/Admin/Supervisor/Superadmin may SELECT all rows at their
-- branch. No staff INSERT policy for any role - rows are created only by
-- the check-in service's service-role client (#75).

alter table public.care_log_entries enable row level security;

create policy "Pet assistants can read care log entries at their branch"
  on public.care_log_entries
  for select
  to authenticated
  using (
    public.current_staff_role() = 'Pet Assistant'
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Front-desk staff can read care log entries at their branch"
  on public.care_log_entries
  for select
  to authenticated
  using (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Superadmins can read all care log entries"
  on public.care_log_entries
  for select
  to authenticated
  using (public.current_staff_role() = 'Superadmin');
