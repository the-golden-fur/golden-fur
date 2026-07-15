create or replace function public.get_staff_availability(
  p_staff_id uuid,
  p_requested_start timestamptz,
  p_requested_end timestamptz
)
returns boolean
language plpgsql
stable
as $$
declare
  v_branch_id uuid;
  v_branch_timezone text;
  v_day_name text;
  v_requested_start_local time;
  v_requested_end_local time;
  v_open_time time;
  v_close_time time;
  v_has_unavailability_overlap boolean;
begin
  if p_requested_end <= p_requested_start then
    return false;
  end if;

  select sp.branch_id
    into v_branch_id
  from public.staff_profiles sp
  where sp.id = p_staff_id;

  if v_branch_id is null then
    return false;
  end if;

  select b.timezone
    into v_branch_timezone
  from public.branches b
  where b.id = v_branch_id;

  if v_branch_timezone is null then
    return false;
  end if;

  v_day_name := lower(trim(to_char(p_requested_start at time zone v_branch_timezone, 'day')));
  v_requested_start_local := (p_requested_start at time zone v_branch_timezone)::time;
  v_requested_end_local := (p_requested_end at time zone v_branch_timezone)::time;

  if not exists (
    select 1
    from public.branches b
    where b.id = v_branch_id
      and b.operating_hours ? v_day_name
  ) then
    return false;
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
  where b.id = v_branch_id;

  if v_open_time is null or v_close_time is null then
    return false;
  end if;

  if v_requested_start_local < v_open_time
     or v_requested_end_local > v_close_time
     or v_requested_start_local >= v_requested_end_local
  then
    return false;
  end if;

  if to_regclass('public.bookings') is not null then
    -- TODO(Sprint 2, M03): wire real booking overlap check here.
    -- Example: inspect public.bookings for confirmed overlaps for this staff.
  end if;

  select exists (
    select 1
    from public.staff_unavailability_blocks sub
    where sub.staff_id = p_staff_id
      and sub.start_time < p_requested_end
      and sub.end_time > p_requested_start
  ) into v_has_unavailability_overlap;

  if v_has_unavailability_overlap then
    return false;
  end if;

  return true;
end;
$$;
