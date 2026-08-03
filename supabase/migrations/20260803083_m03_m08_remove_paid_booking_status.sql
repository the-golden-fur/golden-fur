-- Retires 'Paid' as a bookings.status value. Payment is now tracked
-- exclusively via the independent payment_stage column (...082) - a
-- booking's service-lifecycle status and its payment status move
-- independently. The old status-level "Mark as Paid" action
-- (markBookingPaid) is removed entirely in favor of the payment_stage
-- track's own "Mark as Paid" action (advancePaymentStage).
--
-- Backfill, in order:
-- 1) Any row currently status = 'Paid' represents a booking that WAS fully
--    settled under the old model - preserve that fact by setting
--    payment_stage = 'Paid' before the status value disappears, rather than
--    silently losing it.
-- 2) The status column itself moves to a 'Paid'-less enum, with any 'Paid'
--    row backfilled to 'Completed' (the service still happened - only the
--    payment-status label is retired, not the "this occurred" fact, which
--    payment_stage now carries).
--
-- Same create-_new/backfill/swap technique as 20260728058_m03_unify_
-- booking_status.sql, which introduced 'Paid' in the first place.

update public.bookings
set payment_stage = 'Paid'
where status = 'Paid'
  and payment_stage = 'Unpaid';

create type public.booking_status_new as enum (
  'Pending',
  'In Progress',
  'Completed',
  'Cancelled',
  'No-show'
);

alter table public.bookings
  alter column status drop default;

-- Must be dropped BEFORE the column's type changes below, same reasoning as
-- the original 20260728058 migration's own note on this. Recreated below
-- with the new (Paid-less) predicate.
drop index if exists public.bookings_staff_active_idx;

alter table public.bookings
  alter column status type public.booking_status_new
  using (
    case status::text
      when 'Paid' then 'Completed'
      else status::text
    end
  )::public.booking_status_new;

alter table public.bookings
  alter column status set default 'Pending';

drop type public.booking_status;
alter type public.booking_status_new rename to booking_status;

create index bookings_staff_active_idx
  on public.bookings(assigned_staff_id, scheduled_start)
  where status in ('Pending', 'In Progress', 'Completed');

-- get_staff_availability()'s Check 2 hardcoded the same 'Paid'-inclusive
-- status list (20260728062) - redefine against the new enum so a capacity
-- check for a Completed booking (still holds a real slot) keeps working,
-- and so the function's own type signature no longer references a status
-- value that can't occur. CREATE OR REPLACE against the identical
-- signature, same rationale as ...062's own header note - no caller
-- changes. Everything else in the body is byte-for-byte unchanged.
create or replace function public.get_staff_availability(
  p_role public.staff_role,
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

  return query
  select sp.id, sp.display_name, sp.profile_photo_url
  from public.staff_profiles sp
  where sp.branch_id = p_branch_id
    and sp.role = p_role
    and sp.is_active
    and (p_staff_id is null or sp.id = p_staff_id)
    -- Check 2 (updated ...083): no overlapping booking in any status that
    -- still holds a real slot - Pending/In Progress/Completed. 'Paid' no
    -- longer exists as a status value (see payment_stage instead).
    and not exists (
      select 1
      from public.bookings bk
      where bk.assigned_staff_id = sp.id
        and bk.status in ('Pending', 'In Progress', 'Completed')
        and (p_exclude_booking_id is null or bk.id <> p_exclude_booking_id)
        and bk.scheduled_start < p_requested_end
        and bk.scheduled_end > p_requested_start
    )
    -- Check 3: no overlapping APPROVED unavailability block (#49 AC-3);
    -- pending/denied rows are ignored per the Jul 11, 2026 redesign.
    and not exists (
      select 1
      from public.staff_unavailability_blocks sub
      where sub.staff_id = sp.id
        and sub.status = 'approved'
        and sub.start_time < p_requested_end
        and sub.end_time > p_requested_start
    )
    order by sp.display_name, sp.id;
end;
$$;
