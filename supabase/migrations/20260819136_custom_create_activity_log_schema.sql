-- Custom change: Hotel/Daycare activity logbook (#48 follow-up) - "a logbook
-- for all hotel/daycare actions (e.g. task moved from pending > in progress,
-- etc.)". Unprefixed name (not `hotel_activity_log`) matching the existing
-- convention for tables shared by both Hotel and Daycare since the
-- 20260807104 unification (`stays`, `care_log_entries` are unprefixed too).
--
-- `branch_id` is denormalized directly onto the row (not derived via a
-- `stay_id` join) so a log entry survives even a future stay/entry deletion
-- and so RLS/branch-scoped listing needs no join at read time - mirrors why
-- `stays` itself carries `branch_id` directly rather than only through
-- `cages`.
--
-- `actor_staff_id` is nullable - the lazy Missed transition
-- (applyMissedTransition, careLogCompletion.service.ts) is system-driven,
-- not performed by any particular staff member.

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  stay_id uuid references public.stays(id) on delete cascade,
  care_log_entry_id uuid references public.care_log_entries(id) on delete cascade,
  action text not null check (action in (
    'check_in',
    'check_out',
    'task_started',
    'task_completed',
    'task_reopened',
    'task_missed'
  )),
  actor_staff_id uuid references public.staff_profiles(id),
  description text not null,
  created_at timestamptz not null default now()
);

create index activity_log_branch_created_idx
  on public.activity_log (branch_id, created_at desc);
create index activity_log_stay_id_idx on public.activity_log (stay_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Read access mirrors HOTEL_ADVANCE_ROLES (hotel.types.ts) - every role that
-- can see the Hotel/Daycare queues and Boarding Checklist can also see the
-- log of what happened on them. No staff INSERT/UPDATE/DELETE policy for any
-- role - every row is written by careLogActivity.service.ts's service-role
-- client only, same as every other table in this feature (care_log_entries,
-- notifications, ...).

alter table public.activity_log enable row level security;

create policy "Staff can read the activity log at their branch"
  on public.activity_log
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Superadmins can read the activity log for every branch"
  on public.activity_log
  for select
  to authenticated
  using (public.current_staff_role() = 'Superadmin');
