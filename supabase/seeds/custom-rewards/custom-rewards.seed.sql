-- Custom change (coupon spin wheel + weekly-recurring promos, session 86;
-- reward pools + spin-wheel promos, session 114).
--
-- Pure-SQL alternative to custom-rewards.seed.ts, for when you'd rather
-- paste this into the Supabase SQL Editor / run it via psql than a Node
-- script. Self-contained - every insert below is plain SQL.
--
--   1. spin_wheel_rewards - a starter catalog with a rarity tier + weight
--      per reward (chance = weight / total weight within a pool, so nothing
--      has to add up to 100). Per-row: only inserts labels not present yet.
--   2. reward_pools / reward_pool_rewards - "Standard" (the original five
--      rewards; the pool row itself is normally created by migration
--      20260925213) and a demo "Rare Rewards" pool (Rare/Epic/Legendary).
--   3. promos / promo_branch_availability - one demo weekly_recurring promo
--      ("Midweek Discount", every Tuesday/Wednesday), available at every
--      branch.
--   4. promos / spin_wheel_promo_settings - one demo spin_wheel promo
--      ("Monthly Login Bonus": a 5-day login streak within a month spins the
--      Rare Rewards pool, pity 3). No branch availability - spin-wheel
--      promos are customer-wide.
--
-- Not part of one of the original M01-M14 modules, so this folder
-- deliberately has no `mNN-` prefix - mirrors how out-of-module migrations
-- use a `custom_` prefix instead of `mNN_`.
--
-- Runs automatically on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths, ordered after m01's seed so branches.id values
-- exist). Idempotent - guarded by NOT EXISTS throughout, safe to re-run
-- against a database that already has these rows.

-- ============================================================
-- 1. spin_wheel_rewards - starter catalog (per-row)
-- ============================================================

insert into public.spin_wheel_rewards (label, discount_type, value, rarity_tier, weight, is_active)
select v.label, v.discount_type::public.discount_type, v.value, v.rarity_tier::public.reward_rarity_tier, v.weight, true
from (
  values
    ('5% off your next booking', 'Percentage', 5.00, 'Common', 40.00),
    ('10% off your next booking', 'Percentage', 10.00, 'Common', 30.00),
    ('15% off your next booking', 'Percentage', 15.00, 'Uncommon', 15.00),
    ('PHP 100 off', 'Flat', 100.00, 'Rare', 10.00),
    ('20% off your next booking', 'Percentage', 20.00, 'Epic', 8.00),
    ('PHP 250 off', 'Flat', 250.00, 'Legendary', 5.00)
) as v(label, discount_type, value, rarity_tier, weight)
where not exists (
  select 1 from public.spin_wheel_rewards as existing
  where existing.label = v.label
);

-- ============================================================
-- 2. Reward pools + members
-- ============================================================

insert into public.reward_pools (name, description)
select v.name, v.description
from (
  values
    ('Standard', 'The original spin wheel reward list, converted automatically when reward pools were introduced.'),
    ('Rare Rewards', 'Only the rarest rewards - for loyal, frequent visitors.')
) as v(name, description)
where not exists (
  select 1 from public.reward_pools as existing
  where existing.name = v.name and existing.archived_at is null
);

insert into public.reward_pool_rewards (reward_pool_id, spin_wheel_reward_id)
select p.id, r.id
from (
  values
    ('Standard', '5% off your next booking'),
    ('Standard', '10% off your next booking'),
    ('Standard', '15% off your next booking'),
    ('Standard', 'PHP 100 off'),
    ('Standard', 'PHP 250 off'),
    ('Rare Rewards', 'PHP 100 off'),
    ('Rare Rewards', '20% off your next booking'),
    ('Rare Rewards', 'PHP 250 off')
) as v(pool_name, reward_label)
join public.reward_pools as p
  on p.name = v.pool_name and p.archived_at is null
join public.spin_wheel_rewards as r
  on r.label = v.reward_label
where not exists (
  select 1 from public.reward_pool_rewards as existing
  where existing.reward_pool_id = p.id and existing.spin_wheel_reward_id = r.id
);

-- ============================================================
-- 3. Demo weekly-recurring promo (+ promo_branch_availability)
-- ============================================================

insert into public.promos (name, promo_type, days_of_week, discount_type, value, scope_type, is_active)
select 'Midweek Discount', 'weekly_recurring'::public.promo_type, array[2, 3], 'Percentage'::public.discount_type, 10.00, 'all_services', true
where not exists (
  select 1 from public.promos where name = 'Midweek Discount'
);

insert into public.promo_branch_availability (promo_id, branch_id, is_available)
select p.id, b.id, true
from public.promos as p
cross join public.branches as b
where p.name = 'Midweek Discount'
  and not exists (
    select 1 from public.promo_branch_availability as existing
    where existing.promo_id = p.id and existing.branch_id = b.id
  );

-- ============================================================
-- 4. Demo spin-wheel promo (+ spin_wheel_promo_settings)
-- ============================================================

insert into public.promos (name, promo_type, is_active)
select 'Monthly Login Bonus', 'spin_wheel'::public.promo_type, true
where not exists (
  select 1 from public.promos where name = 'Monthly Login Bonus'
);

insert into public.spin_wheel_promo_settings (
  promo_id, reward_pool_id, pity_threshold, login_trigger, login_streak_days
)
select p.id, rp.id, 3, 'monthly_login_streak', 5
from public.promos as p
join public.reward_pools as rp
  on rp.name = 'Rare Rewards' and rp.archived_at is null
where p.name = 'Monthly Login Bonus'
  and not exists (
    select 1 from public.spin_wheel_promo_settings as existing
    where existing.promo_id = p.id
  );
