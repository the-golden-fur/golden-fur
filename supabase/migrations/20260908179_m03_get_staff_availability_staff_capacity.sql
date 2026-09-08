-- Staff concurrency: get_staff_availability() Check 2 honours
-- policy_configurations.max_concurrent_bookings_per_staff (20260908178)
-- instead of a hardcoded capacity of 1.
--
-- Signature is UNCHANGED from 20260904169 (p_roles staff_role[], ...), so this
-- is a plain `create or replace` - it keeps the revoke/grant state applied by
-- 20260904169 + 20260904172 (authenticated/service_role only), unlike 169's
-- own drop+create.
--
-- Body is 20260904169's verbatim except:
--   * new v_max_concurrent declaration + read (same branch-row-wins-else-
--     system-default block already used for lunch_break_*, mirroring
--     resolveEffectivePolicy() server-side);
--   * Check 2 `not exists (...)` -> `(select count(*) ...) < v_max_concurrent`.
--
-- Cautionary note carried over from every prior redefinition: this function
-- has repeatedly been clobbered by parallel same-day migrations branching off
-- a stale copy - confirm no other migration redefines it between 20260904169
-- and here before basing a future change on this one.

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
    -- bookings that still hold a real slot - Pending/In Progress/Completed,
    -- EXCEPT a down-payment-required booking that hasn't paid any of its down
    -- payment yet (down-payment slot gate, 20260829146/147): that one sits
    -- Pending without reserving anything until payment_status leaves
    -- 'Pending'. Mirrors the downpayment_required/payment_status filter
    -- grooming.service.ts and consultation.service.ts already apply to their
    -- queues.
    and (
      select count(*)
      from public.bookings bk
      where bk.assigned_staff_id = sp.id
        and bk.status in ('Pending', 'In Progress', 'Completed')
        and not (bk.downpayment_required and bk.payment_status = 'Pending')
        and (p_exclude_booking_id is null or bk.id <> p_exclude_booking_id)
        and bk.scheduled_start < p_requested_end
        and bk.scheduled_end > p_requested_start
    ) < v_max_concurrent
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
