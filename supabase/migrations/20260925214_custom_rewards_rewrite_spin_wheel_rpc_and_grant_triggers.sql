-- Custom change (session 114): the spin-wheel engine, rewritten for
-- multiple spin-wheel promos, each with its own reward pool, pity threshold
-- and trigger conditions (20260925211).
--
--   * spin_wheel_promo_is_live()  - is this promo currently granting spins?
--   * grant_spin_credit()         - idempotent single-credit insert.
--   * trg_increment_booking_milestone / trg_spend_threshold_spin_credit -
--     same triggers as 20260913199, now looping every live promo instead of
--     reading one global spin_wheel_config row.
--   * record_customer_login()     - records today's portal visit and grants
--     any due daily-login / weekly-streak / monthly-streak spins.
--   * spin_wheel()                - weighted roll over the credit's promo's
--     pool; pity is tracked per (customer, promo) and guarantees the pool's
--     RAREST TIER (max(rarity_tier)).
--
-- Every "which day is it" decision uses Asia/Manila, same convention as
-- 20260902160 - never the client clock.

-- ---------------------------------------------------------------------------
-- Backfilled in 20260925213; required from here on.
-- ---------------------------------------------------------------------------

alter table public.customer_spin_credits
  alter column promo_id set not null;

alter table public.spin_history
  alter column promo_id set not null;

delete from public.customer_pity_progress where promo_id is null;

alter table public.customer_pity_progress
  alter column promo_id set not null,
  drop constraint customer_pity_progress_pkey,
  add primary key (customer_id, promo_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.spin_wheel_promo_is_live(
  p_promo_id uuid,
  p_today date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.promos p
    join public.spin_wheel_promo_settings s on s.promo_id = p.id
    join public.reward_pools rp on rp.id = s.reward_pool_id
    where p.id = p_promo_id
      and p.promo_type = 'spin_wheel'
      and p.is_active
      and p.archived_at is null
      and (p.start_date is null or p.start_date <= p_today)
      and (p.end_date is null or p.end_date >= p_today)
      and rp.is_active
      and rp.archived_at is null
      and exists (
        select 1
        from public.reward_pool_rewards m
        join public.spin_wheel_rewards r on r.id = m.spin_wheel_reward_id
        where m.reward_pool_id = rp.id
          and r.is_active
          and r.archived_at is null
      )
  );
$$;

-- ON CONFLICT DO NOTHING with no target: the customer+promo+source+period
-- partial unique index from 20260925212 turns a repeat login grant into a
-- no-op, and the NULL return tells the caller nothing new was granted.
-- (Booking/spend grants rely on their triggers' transition-only WHEN
-- clauses instead - see 20260925212's note.)
create or replace function public.grant_spin_credit(
  p_customer_id uuid,
  p_promo_id uuid,
  p_source text,
  p_booking_id uuid,
  p_transaction_id uuid,
  p_period_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.customer_spin_credits (
    customer_id, promo_id, source, source_booking_id, source_transaction_id, period_key
  )
  values (
    p_customer_id, p_promo_id, p_source, p_booking_id, p_transaction_id, p_period_key
  )
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.spin_wheel_promo_is_live(uuid, date) from public;
revoke all on function public.grant_spin_credit(uuid, uuid, text, uuid, uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Booking / spend triggers (trigger definitions from 20260913199 unchanged -
-- only the functions they call are replaced).
-- ---------------------------------------------------------------------------

create or replace function public.trg_increment_booking_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'Asia/Manila')::date;
  v_new_count integer;
  v_settings  record;
begin
  insert into public.customer_booking_milestone_progress (customer_id)
  values (new.customer_id)
  on conflict (customer_id) do nothing;

  -- One lifetime counter per customer, shared by every promo: "every Nth
  -- completed booking" for each promo's own N.
  update public.customer_booking_milestone_progress
  set completed_bookings_count = completed_bookings_count + 1,
      updated_at = now()
  where customer_id = new.customer_id
  returning completed_bookings_count into v_new_count;

  for v_settings in
    select s.promo_id, s.booking_milestone_interval
    from public.spin_wheel_promo_settings s
    where s.booking_milestone_interval is not null
      and public.spin_wheel_promo_is_live(s.promo_id, v_today)
  loop
    if v_new_count % v_settings.booking_milestone_interval = 0 then
      perform public.grant_spin_credit(
        new.customer_id, v_settings.promo_id, 'booking_milestone', new.id, null, null
      );
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.trg_spend_threshold_spin_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := (now() at time zone 'Asia/Manila')::date;
  v_settings record;
begin
  for v_settings in
    select s.promo_id
    from public.spin_wheel_promo_settings s
    where s.spend_threshold_amount is not null
      and new.total_amount >= s.spend_threshold_amount
      and public.spin_wheel_promo_is_live(s.promo_id, v_today)
  loop
    perform public.grant_spin_credit(
      new.customer_id, v_settings.promo_id, 'spend_threshold', null, new.id, null
    );
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Login check-in
-- ---------------------------------------------------------------------------

-- Output columns are prefixed granted_* so they can't collide with the
-- promo_id/source table columns referenced inside the body.
create or replace function public.record_customer_login(p_customer_id uuid)
returns table(granted_promo_id uuid, granted_source text, granted_credit_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today        date := (now() at time zone 'Asia/Manila')::date;
  v_settings     record;
  v_period_start date;
  v_floor        date;
  v_period_key   text;
  v_run          integer;
  v_day          date;
  v_credit_id    uuid;
begin
  insert into public.customer_login_days (customer_id, login_date)
  values (p_customer_id, v_today)
  on conflict do nothing;

  for v_settings in
    select s.promo_id,
           s.login_trigger,
           s.login_streak_days,
           p.start_date,
           p.created_at
    from public.spin_wheel_promo_settings s
    join public.promos p on p.id = s.promo_id
    where s.login_trigger is not null
      and public.spin_wheel_promo_is_live(s.promo_id, v_today)
  loop
    v_credit_id := null;

    if v_settings.login_trigger = 'daily_login' then
      v_period_key := to_char(v_today, 'YYYY-MM-DD');
      v_credit_id := public.grant_spin_credit(
        p_customer_id, v_settings.promo_id, 'daily_login', null, null, v_period_key
      );
    else
      if v_settings.login_trigger = 'weekly_login_streak' then
        -- ISO week: Monday..Sunday.
        v_period_start := date_trunc('week', v_today)::date;
        v_period_key := to_char(v_today, 'IYYY-"W"IW');
      else
        v_period_start := date_trunc('month', v_today)::date;
        v_period_key := to_char(v_today, 'YYYY-MM');
      end if;

      -- A streak never counts days from before the promo started, so a new
      -- promo doesn't instantly pay out for visits made before it existed.
      v_floor := greatest(
        v_period_start,
        coalesce(
          v_settings.start_date,
          (v_settings.created_at at time zone 'Asia/Manila')::date
        )
      );

      -- Consecutive run of login days ending today, within the period.
      v_run := 0;
      v_day := v_today;
      while v_day >= v_floor and exists (
        select 1
        from public.customer_login_days d
        where d.customer_id = p_customer_id
          and d.login_date = v_day
      ) loop
        v_run := v_run + 1;
        v_day := v_day - 1;
      end loop;

      if v_run >= v_settings.login_streak_days then
        v_credit_id := public.grant_spin_credit(
          p_customer_id, v_settings.promo_id, v_settings.login_trigger, null, null, v_period_key
        );
      end if;
    end if;

    if v_credit_id is not null then
      granted_promo_id := v_settings.promo_id;
      granted_source := v_settings.login_trigger;
      granted_credit_id := v_credit_id;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.record_customer_login(uuid) from public;
grant execute on function public.record_customer_login(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- spin_wheel(): the signature changes, so the old one-arg function must be
-- dropped first - `create or replace` with a new arg list would add a second
-- overload and make the server's rpc('spin_wheel', {p_customer_id}) call
-- ambiguous.
-- ---------------------------------------------------------------------------

drop function if exists public.spin_wheel(uuid);

create function public.spin_wheel(
  p_customer_id uuid,
  p_promo_id uuid default null
)
returns table(
  reward_id uuid,
  was_pity boolean,
  coupon_id uuid,
  history_id uuid,
  wheel_promo_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit     public.customer_spin_credits;
  v_settings   public.spin_wheel_promo_settings;
  v_pity       public.customer_pity_progress;
  v_rarest     public.reward_rarity_tier;
  v_total      numeric;
  v_reward     public.spin_wheel_rewards;
  v_roll       numeric;
  v_cumulative numeric := 0;
  v_was_pity   boolean := false;
  v_pity_hit   boolean;
  v_history_id uuid;
  v_coupon_id  uuid;
begin
  -- skip locked: two concurrent spins for the same customer each grab a
  -- different unconsumed credit rather than one blocking on the other's lock.
  select c.* into v_credit
  from public.customer_spin_credits c
  where c.customer_id = p_customer_id
    and c.is_consumed = false
    and (p_promo_id is null or c.promo_id = p_promo_id)
  order by c.created_at
  limit 1
  for update skip locked;

  if not found then
    raise exception 'spin_wheel: no available spin credit for customer %', p_customer_id;
  end if;

  select s.* into v_settings
  from public.spin_wheel_promo_settings s
  where s.promo_id = v_credit.promo_id;

  if not found then
    raise exception 'spin_wheel: promo % has no spin wheel settings', v_credit.promo_id;
  end if;

  -- An already-earned credit can still be spun after its promo is
  -- deactivated/archived ("earned is earned") - only an empty pool blocks
  -- it, and the raise rolls back so the credit stays unconsumed.
  select max(r.rarity_tier), sum(r.weight) into v_rarest, v_total
  from public.reward_pool_rewards m
  join public.spin_wheel_rewards r on r.id = m.spin_wheel_reward_id
  where m.reward_pool_id = v_settings.reward_pool_id
    and r.is_active
    and r.archived_at is null;

  if v_rarest is null then
    raise exception 'spin_wheel: reward pool has no active rewards';
  end if;

  insert into public.customer_pity_progress (customer_id, promo_id)
  values (p_customer_id, v_credit.promo_id)
  on conflict (customer_id, promo_id) do nothing;

  select pp.* into v_pity
  from public.customer_pity_progress pp
  where pp.customer_id = p_customer_id
    and pp.promo_id = v_credit.promo_id
  for update;

  v_pity_hit := v_settings.pity_threshold is not null
    and v_pity.spins_since_last_pity_win >= v_settings.pity_threshold;

  if v_pity_hit then
    -- Weighted pick among the rarest tier only.
    select sum(r.weight) into v_total
    from public.reward_pool_rewards m
    join public.spin_wheel_rewards r on r.id = m.spin_wheel_reward_id
    where m.reward_pool_id = v_settings.reward_pool_id
      and r.is_active
      and r.archived_at is null
      and r.rarity_tier = v_rarest;
  end if;

  v_roll := random() * v_total;

  -- Cumulative-weight walk. If float rounding ever leaves v_roll >= the
  -- final total, the loop ends on (and keeps) the last row.
  for v_reward in
    select r.*
    from public.reward_pool_rewards m
    join public.spin_wheel_rewards r on r.id = m.spin_wheel_reward_id
    where m.reward_pool_id = v_settings.reward_pool_id
      and r.is_active
      and r.archived_at is null
      and (not v_pity_hit or r.rarity_tier = v_rarest)
    order by r.id
  loop
    v_cumulative := v_cumulative + v_reward.weight;
    exit when v_roll < v_cumulative;
  end loop;

  -- A natural hit on the rarest tier also resets the pity counter.
  v_was_pity := (v_reward.rarity_tier = v_rarest);

  update public.customer_pity_progress pp
  set spins_since_last_pity_win =
        case when v_was_pity then 0 else pp.spins_since_last_pity_win + 1 end,
      updated_at = now()
  where pp.customer_id = p_customer_id
    and pp.promo_id = v_credit.promo_id;

  update public.customer_spin_credits c
  set is_consumed = true, consumed_at = now()
  where c.id = v_credit.id;

  insert into public.spin_history (
    customer_id, spin_wheel_reward_id, spin_credit_id, was_pity, promo_id, reward_pool_id
  )
  values (
    p_customer_id, v_reward.id, v_credit.id, v_was_pity, v_credit.promo_id, v_settings.reward_pool_id
  )
  returning id into v_history_id;

  insert into public.customer_coupons
    (customer_id, spin_wheel_reward_id, spin_history_id, discount_type, value)
  values
    (p_customer_id, v_reward.id, v_history_id, v_reward.discount_type, v_reward.value)
  returning id into v_coupon_id;

  return query
    select v_reward.id, v_was_pity, v_coupon_id, v_history_id, v_credit.promo_id;
end;
$$;

revoke all on function public.spin_wheel(uuid, uuid) from public;
grant execute on function public.spin_wheel(uuid, uuid) to service_role;
