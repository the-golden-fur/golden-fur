-- Custom change (session 114): converts the old single, global spin wheel
-- into the new promo + pool shape, in EVERY environment. This is a migration,
-- not a seed, on purpose: seeds only run on `supabase db reset`, never on
-- `db push`, so the provisioned dev/prod databases would otherwise be left
-- with credits pointing at no promo.
--
--   * a "Standard" reward pool containing every non-archived reward that
--     exists right now (may be zero on a fresh `db reset`, where migrations
--     run before seeds - the custom-rewards seed attaches its rewards to
--     this pool by name),
--   * a "Loyalty Spin" spin-wheel promo carrying the old spin_wheel_config
--     numbers (every N completed bookings, single-transaction spend, pity),
--   * every existing spin credit / pity counter / spin history row is
--     pointed at that promo, so no customer loses an earned spin.

do $$
declare
  v_config   public.spin_wheel_config;
  v_pool_id  uuid;
  v_promo_id uuid;
begin
  select * into v_config from public.spin_wheel_config limit 1;

  insert into public.reward_pools (name, description)
  values (
    'Standard',
    'The original spin wheel reward list, converted automatically when reward pools were introduced.'
  )
  returning id into v_pool_id;

  insert into public.reward_pool_rewards (reward_pool_id, spin_wheel_reward_id)
  select v_pool_id, id
  from public.spin_wheel_rewards
  where archived_at is null;

  insert into public.promos (name, promo_type, is_active)
  values ('Loyalty Spin', 'spin_wheel', true)
  returning id into v_promo_id;

  insert into public.spin_wheel_promo_settings (
    promo_id,
    reward_pool_id,
    pity_threshold,
    booking_milestone_interval,
    spend_threshold_amount
  )
  values (
    v_promo_id,
    v_pool_id,
    coalesce(v_config.pity_threshold, 10),
    coalesce(v_config.bookings_milestone_interval, 5),
    -- The new column requires > 0; an old 0 threshold meant "every fully
    -- paid transaction", which the booking trigger alone now covers better.
    nullif(coalesce(v_config.spend_threshold_amount, 5000.00), 0)
  );

  update public.customer_spin_credits
  set promo_id = v_promo_id
  where promo_id is null;

  update public.customer_pity_progress
  set promo_id = v_promo_id
  where promo_id is null;

  update public.spin_history
  set promo_id = v_promo_id,
      reward_pool_id = v_pool_id
  where promo_id is null;
end $$;
