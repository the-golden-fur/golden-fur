-- Custom change (coupon spin wheel, session 86): the atomic "spin the
-- wheel" operation, mirroring issue_credit()/redeem_credit()'s row-lock
-- style (20260805097/20260901155) - consume a spin credit, roll (or apply
-- pity), record history, and issue the resulting coupon, all in one
-- transaction so a race can't double-spend a spin credit or desync the
-- pity counter.

create table public.spin_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  spin_wheel_reward_id uuid not null references public.spin_wheel_rewards(id),
  spin_credit_id uuid not null references public.customer_spin_credits(id),
  was_pity boolean not null default false,
  created_at timestamptz not null default now()
);

create index spin_history_customer_id_idx on public.spin_history(customer_id);

alter table public.spin_history enable row level security;

create policy "Customers can read their own spin history"
  on public.spin_history for select to authenticated
  using (customer_id = auth.uid());
create policy "Staff can read any spin history"
  on public.spin_history for select to authenticated
  using (public.current_staff_role() is not null);

-- Added here (rather than in the previous migration's customer_coupons
-- definition) to avoid a forward reference to spin_history across files.
alter table public.customer_coupons
  add column spin_history_id uuid references public.spin_history(id);

create or replace function public.spin_wheel(p_customer_id uuid)
returns table(reward_id uuid, was_pity boolean, coupon_id uuid, history_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit     public.customer_spin_credits;
  v_config     public.spin_wheel_config;
  v_pity       public.customer_pity_progress;
  v_lowest     numeric;
  v_reward     public.spin_wheel_rewards;
  v_roll       numeric;
  v_cumulative numeric := 0;
  v_was_pity   boolean := false;
  v_history_id uuid;
  v_coupon_id  uuid;
begin
  -- skip locked: two concurrent spins for the same customer each grab a
  -- different unconsumed credit rather than one blocking on the other's lock.
  select * into v_credit
  from public.customer_spin_credits
  where customer_id = p_customer_id and is_consumed = false
  order by created_at
  limit 1
  for update skip locked;

  if not found then
    raise exception 'spin_wheel: no available spin credit for customer %', p_customer_id;
  end if;

  select * into v_config from public.spin_wheel_config limit 1;
  if not found then
    raise exception 'spin_wheel: spin_wheel_config has no row';
  end if;

  insert into public.customer_pity_progress (customer_id)
  values (p_customer_id)
  on conflict (customer_id) do nothing;

  select * into v_pity
  from public.customer_pity_progress
  where customer_id = p_customer_id
  for update;

  select min(rarity_percent) into v_lowest
  from public.spin_wheel_rewards
  where is_active and archived_at is null;

  if v_lowest is null then
    raise exception 'spin_wheel: no active rewards configured';
  end if;

  if v_pity.spins_since_last_pity_win >= v_config.pity_threshold then
    v_was_pity := true;

    -- Uniformly random among ties at the lowest rarity.
    select * into v_reward
    from public.spin_wheel_rewards
    where is_active and archived_at is null and rarity_percent = v_lowest
    order by random()
    limit 1;
  else
    v_roll := random() * 100;

    for v_reward in
      select * from public.spin_wheel_rewards
      where is_active and archived_at is null
      order by id
    loop
      v_cumulative := v_cumulative + v_reward.rarity_percent;
      exit when v_roll <= v_cumulative;
    end loop;

    v_was_pity := (v_reward.rarity_percent = v_lowest);
  end if;

  update public.customer_pity_progress
  set spins_since_last_pity_win =
        case when v_was_pity then 0 else spins_since_last_pity_win + 1 end,
      updated_at = now()
  where customer_id = p_customer_id;

  update public.customer_spin_credits
  set is_consumed = true, consumed_at = now()
  where id = v_credit.id;

  insert into public.spin_history (customer_id, spin_wheel_reward_id, spin_credit_id, was_pity)
  values (p_customer_id, v_reward.id, v_credit.id, v_was_pity)
  returning id into v_history_id;

  insert into public.customer_coupons
    (customer_id, spin_wheel_reward_id, spin_history_id, discount_type, value)
  values
    (p_customer_id, v_reward.id, v_history_id, v_reward.discount_type, v_reward.value)
  returning id into v_coupon_id;

  return query select v_reward.id, v_was_pity, v_coupon_id, v_history_id;
end;
$$;

revoke all on function public.spin_wheel(uuid) from public;
grant execute on function public.spin_wheel(uuid) to service_role;
