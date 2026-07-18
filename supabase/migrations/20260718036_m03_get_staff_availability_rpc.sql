-- Sprint 2 Epic B (#49): get_staff_availability() Postgres RPC - completes
-- the 3-condition check deferred by Epic A-1 (#12), porting Sprint 1 Epic B's
-- staffAvailability.service.ts (#27) TS reference implementation into SQL.
--
-- Sequencing note: merged AFTER ...035 (#50) despite the lower issue number -
-- the booking-overlap condition needs the bookings table to exist. See the
-- Guide's Sequencing Note.
--
-- Signature note: the Guide says CREATE OR REPLACE against the same function
-- name so no caller changes; the new shape returns a SET of eligible staff
-- (per the DB Design sheet) rather than the old per-staff boolean, and
-- Postgres cannot change a return type in place - so the old boolean overload
-- (uuid, timestamptz, timestamptz) from ...014/...031 is dropped explicitly.
-- No production caller ever invoked the boolean version (Sprint 1's read path
-- is the TS service), so nothing breaks.
--
-- Conditions, matching #27 and the Jul 11, 2026 staff_unavailability_blocks
-- redesign exactly:
--   1. the requested window falls within the branch's operating hours;
--   2. no overlapping bookings row with status = 'Confirmed' for the staff
--      member (p_exclude_booking_id lets #54's reschedule re-check skip the
--      booking being moved, so it never collides with itself);
--   3. no overlapping staff_unavailability_blocks row with status =
--      'approved' - pending/denied rows must NOT count.
--
-- p_staff_id narrows the set to one staff member (the booking-creation
-- capacity re-verification call shape); NULL lists all eligible staff (the
-- Slot/Staff Picker call shape). Returns (staff_id, display_name,
-- profile_photo_url) so the Staff Picker UI (#57) renders cards directly
-- from the RPC result without a second round-trip to staff_profiles.
--
-- SECURITY DEFINER (same rationale as deactivate_expired_promos): the result
-- only exposes the exact fields the customer-facing Staff Picker is specified
-- to show, and customer sessions have no staff_profiles read policy of their
-- own.

drop function if exists public.get_staff_availability(
  uuid, timestamptz, timestamptz
);

create function public.get_staff_availability(
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
    -- Check 2: no overlapping Confirmed booking (#49 AC-2). Real now that
    -- ...035 created the bookings table - replaces the ...014/...031
    -- to_regclass placeholder.
    and not exists (
      select 1
      from public.bookings bk
      where bk.assigned_staff_id = sp.id
        and bk.status = 'Confirmed'
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

revoke all on function public.get_staff_availability(
  public.staff_role, uuid, timestamptz, timestamptz, uuid, uuid
) from public;
grant execute on function public.get_staff_availability(
  public.staff_role, uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated;
grant execute on function public.get_staff_availability(
  public.staff_role, uuid, timestamptz, timestamptz, uuid, uuid
) to service_role;
