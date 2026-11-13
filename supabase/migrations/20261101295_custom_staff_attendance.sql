-- Custom change (staff attendance): Supervisors mark staff Present, Absent or
-- Late per day, and those marks feed booking availability. No row means the
-- default - Present, with no override - so the table only holds what a
-- Supervisor actually changed. Written by the server (service role) only.
--
-- This enum is deliberately not shared with the booking status of the same
-- name: a Late booking and a Late staff member are unrelated.

create type public.staff_attendance_status as enum ('Present', 'Absent', 'Late');

create table public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  attendance_date date not null,
  status public.staff_attendance_status not null,
  marked_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, attendance_date)
);

create index staff_attendance_branch_date_idx
  on public.staff_attendance(branch_id, attendance_date);

alter table public.staff_attendance enable row level security;

create policy "Managers can read staff attendance"
  on public.staff_attendance
  for select
  to authenticated
  using (
    public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin')
  );

create trigger trg_archive_deleted_row
  after delete on public.staff_attendance
  for each row execute function public.archive_deleted_row();

-- get_staff_availability: 20261101293's body verbatim except Check 3 and the
-- new Check 4, plus v_requested_date. Same signature, so a plain
-- `create or replace` keeps 20260904172's revoke/grant state.

create or replace function public.get_staff_availability(
  p_roles public.staff_role[],
  p_branch_id uuid,
  p_requested_start timestamptz,
  p_requested_end timestamptz,
  p_staff_id uuid default null,
  p_exclude_booking_id uuid default null
)
returns table (
  staff_id uuid,
  display_name text,
  profile_photo_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch_timezone text;
  v_day_name text;
  v_requested_start_local time;
  v_requested_end_local time;
  v_open_time time;
  v_close_time time;
  v_lunch_break_enabled boolean;
  v_lunch_break_start time;
  v_lunch_break_end time;
  v_max_concurrent integer;
  v_requested_date date;
begin
  if p_requested_end <= p_requested_start then
    return;
  end if;

  select b.timezone
    into v_branch_timezone
  from public.branches b
  where b.id = p_branch_id;

  if v_branch_timezone is null then
    return;
  end if;

  v_day_name :=
    lower(trim(to_char(p_requested_start at time zone v_branch_timezone, 'day')));
  v_requested_date :=
    (p_requested_start at time zone v_branch_timezone)::date;
  v_requested_start_local :=
    (p_requested_start at time zone v_branch_timezone)::time;
  v_requested_end_local :=
    (p_requested_end at time zone v_branch_timezone)::time;

  -- Check 1: within branch operating hours for that day. Branch-level, so a
  -- failure returns an empty set regardless of staff schedules (#49 AC-4).
  if not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.operating_hours ? v_day_name
  ) then
    return;
  end if;

  select
    make_time(
      split_part((b.operating_hours -> v_day_name ->> 'open'), ':', 1)::int,
      split_part((b.operating_hours -> v_day_name ->> 'open'), ':', 2)::int,
      0
    ),
    make_time(
      split_part((b.operating_hours -> v_day_name ->> 'close'), ':', 1)::int,
      split_part((b.operating_hours -> v_day_name ->> 'close'), ':', 2)::int,
      0
    )
    into v_open_time, v_close_time
  from public.branches b
  where b.id = p_branch_id;

  if v_open_time is null or v_close_time is null then
    return;
  end if;

  if v_requested_start_local < v_open_time
     or v_requested_end_local > v_close_time
     or v_requested_start_local >= v_requested_end_local
  then
    return;
  end if;

  -- Lunch break check: the branch-specific policy_configurations row wins
  -- whole-row if one exists, else the system-wide default (branch_id null)
  -- row - same whole-row precedence resolveEffectivePolicy() uses
  -- server-side, mirrored here so the RPC agrees with the TS resolution.
  select pc.lunch_break_enabled, pc.lunch_break_start, pc.lunch_break_end
    into v_lunch_break_enabled, v_lunch_break_start, v_lunch_break_end
  from public.policy_configurations pc
  where pc.branch_id = p_branch_id
  limit 1;

  if not found then
    select pc.lunch_break_enabled, pc.lunch_break_start, pc.lunch_break_end
      into v_lunch_break_enabled, v_lunch_break_start, v_lunch_break_end
    from public.policy_configurations pc
    where pc.branch_id is null
    limit 1;
  end if;

  if v_lunch_break_enabled
     and v_requested_start_local < v_lunch_break_end
     and v_requested_end_local > v_lunch_break_start
  then
    return;
  end if;

  -- Staff concurrency limit: same branch-row-wins-else-system-default
  -- precedence as the lunch break above. Defaults to 1 (one pet at a time)
  -- when no policy row exists at all.
  select pc.max_concurrent_bookings_per_staff
    into v_max_concurrent
  from public.policy_configurations pc
  where pc.branch_id = p_branch_id
  limit 1;

  if not found then
    select pc.max_concurrent_bookings_per_staff
      into v_max_concurrent
    from public.policy_configurations pc
    where pc.branch_id is null
    limit 1;
  end if;

  v_max_concurrent := coalesce(v_max_concurrent, 1);

  return query
  select sp.id, sp.display_name, sp.profile_photo_url
  from public.staff_profiles sp
  where sp.branch_id = p_branch_id
    and sp.role = any(p_roles)
    and sp.is_active
    and (p_staff_id is null or sp.id = p_staff_id)
    -- Check 2: fewer than max_concurrent_bookings_per_staff overlapping
    -- bookings that still hold a real slot - Pending/Late/In Progress/
    -- Completed, EXCEPT a down-payment-required booking that hasn't paid
    -- any of its down payment yet (down-payment slot gate, 20260829146/147):
    -- that one sits Pending without reserving anything until payment_status
    -- leaves 'Pending'. Mirrors the downpayment_required/payment_status
    -- filter grooming.service.ts and consultation.service.ts already apply
    -- to their queues. A 'Completed' row's effective end is its actual
    -- completed_at, not the estimated scheduled_end - every other status
    -- has no real end time yet, so those still use the estimate.
    and (
      select count(*)
      from public.bookings bk
      where bk.assigned_staff_id = sp.id
        and bk.status in ('Pending', 'Late', 'In Progress', 'Completed')
        and not (bk.downpayment_required and bk.payment_status = 'Pending')
        and (p_exclude_booking_id is null or bk.id <> p_exclude_booking_id)
        and bk.scheduled_start < p_requested_end
        and (
          case
            when bk.status = 'Completed'
              then coalesce(bk.completed_at, bk.scheduled_end)
            else bk.scheduled_end
          end
        ) > p_requested_start
    ) < v_max_concurrent
    -- Check 3: no overlapping APPROVED unavailability block (#49 AC-3);
    -- pending/denied rows are ignored per the Jul 11, 2026 redesign. A saved
    -- Present mark that day lifts a Rest Day/Other block, never Sick/Vacation.
    and not exists (
      select 1
      from public.staff_unavailability_blocks sub
      where sub.staff_id = sp.id
        and sub.status = 'approved'
        and sub.start_time < p_requested_end
        and sub.end_time > p_requested_start
        and not (
          sub.leave_type in ('Rest Day', 'Other')
          and exists (
            select 1
            from public.staff_attendance sa
            where sa.staff_id = sp.id
              and sa.attendance_date = v_requested_date
              and sa.status = 'Present'
          )
        )
    )
    -- Check 4: not marked Absent for this branch-local day.
    and not exists (
      select 1
      from public.staff_attendance sa
      where sa.staff_id = sp.id
        and sa.attendance_date = v_requested_date
        and sa.status = 'Absent'
    )
  order by sp.display_name, sp.id;
end;
$$;
