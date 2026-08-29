-- Custom change (down-payment slot gate): a down-payment-required Online
-- booking that hasn't paid any of its down payment yet
-- (downpayment_required = true AND payment_stage = 'Unpaid') must NOT hold
-- its staff-time slot - the slot stays bookable by other customers until an
-- actual payment lands (advisor addendum A3: "an unpaid down payment
-- should NOT lock the booking into the queue - the slot must stay bookable
-- by others ... Only an actual payment ... should move it into a real,
-- locked slot").
--
-- The Grooming/Veterinary staff queues already applied exactly this filter
-- to what they vivify (grooming.service.ts / consultation.service.ts:
-- `downpayment_required.eq.false,payment_stage.neq.Unpaid`). This lifts the
-- same rule down to the availability/capacity layer so the Slot Picker and
-- the authoritative pre-insert check agree with the queues - otherwise an
-- unpaid pencil-booking would still grey out the slot for everyone else.
--
-- CREATE OR REPLACE against the identical signature (same rationale as every
-- prior redefinition's header - 20260728062 / ...083 / ...092 / ...109). Body
-- is 20260808109 verbatim except Check 2 gains the
-- `not (downpayment_required and payment_stage = 'Unpaid')` guard and its
-- comment. Cautionary note carried over from 20260808109: this function has
-- twice been clobbered by parallel same-day migrations branching off a
-- stale copy - this one is based on the current (20260808109) definition;
-- confirm no other migration redefines it between ...109 and here.
--
-- capacity.service.ts (listOverlappingActiveBookings /
-- confirmCapacityAfterInsert) is updated in the same change for the
-- Hotel/Daycare/Grooming-Vet-post-insert paths; this migration covers only
-- the Grooming/Veterinary pre-check that runs through the RPC.

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
  v_lunch_break_enabled boolean;
  v_lunch_break_start time;
  v_lunch_break_end time;
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

  return query
  select sp.id, sp.display_name, sp.profile_photo_url
  from public.staff_profiles sp
  where sp.branch_id = p_branch_id
    and sp.role = p_role
    and sp.is_active
    and (p_staff_id is null or sp.id = p_staff_id)
    -- Check 2: no overlapping booking that still holds a real slot -
    -- Pending/In Progress/Completed, EXCEPT a down-payment-required booking
    -- that hasn't paid any of its down payment yet (down-payment slot gate,
    -- 20260829146/147): that one sits Pending without reserving anything
    -- until payment_stage leaves 'Unpaid'. Mirrors the
    -- downpayment_required/payment_stage filter grooming.service.ts and
    -- consultation.service.ts already apply to their queues.
    and not exists (
      select 1
      from public.bookings bk
      where bk.assigned_staff_id = sp.id
        and bk.status in ('Pending', 'In Progress', 'Completed')
        and not (bk.downpayment_required and bk.payment_stage = 'Unpaid')
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
