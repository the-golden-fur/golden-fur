-- Custom change (session 114): "As an admin, I want to be able to freely add
-- a coupon spin wheel reward and configure its rarity without having to
-- manually adjust everything to make it total to 100%."
--
-- rarity_percent (every active reward's % had to sum to exactly 100) is
-- replaced by two independent fields:
--   * rarity_tier - a display/pity label, Common..Legendary. The enum's
--     declaration order IS the rarity order, so max(rarity_tier) is the
--     rarest tier present in a set of rewards.
--   * weight      - a free positive number. A reward's chance of landing is
--     computed per reward pool as weight / sum(active weights in that pool),
--     so adding or deactivating one reward never requires touching another.
--
-- The deferred sum-to-100 constraint trigger from 20260913196 is dropped:
-- besides the ask above, it made the single-row admin API unable to add or
-- deactivate any reward once the catalog summed to 100 (each PostgREST call
-- is its own transaction, so the "deferred" check still ran after every
-- single write).
--
-- rarity_percent itself is kept until 20260925215 so the old spin_wheel()
-- body stays valid until 20260925214 replaces it.

create type public.reward_rarity_tier as enum (
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary'
);

alter table public.spin_wheel_rewards
  add column rarity_tier public.reward_rarity_tier,
  add column weight numeric(10, 2) check (weight > 0);

-- Dropped BEFORE the backfill UPDATE below, not after: this trigger is
-- DEFERRABLE INITIALLY DEFERRED, so an UPDATE against this table queues a
-- pending trigger event rather than firing immediately. Postgres then
-- refuses any ALTER COLUMN on the table for the rest of the transaction
-- while that event is pending ("cannot ALTER TABLE ... because it has
-- pending trigger events", SQLSTATE 55006) - so the trigger has to be gone
-- before the UPDATE fires it, not merely before the ALTER COLUMN runs.
drop trigger if exists spin_wheel_rewards_sum_check on public.spin_wheel_rewards;
drop function if exists public.check_spin_wheel_rewards_sum();

-- weight = the old percent keeps every existing reward's exact odds; the
-- tier is derived from how rare the old percent was.
update public.spin_wheel_rewards
set weight = rarity_percent,
    rarity_tier = case
      when rarity_percent >= 30 then 'Common'
      when rarity_percent >= 15 then 'Uncommon'
      when rarity_percent >= 10 then 'Rare'
      when rarity_percent > 5 then 'Epic'
      else 'Legendary'
    end::public.reward_rarity_tier;

alter table public.spin_wheel_rewards
  alter column rarity_tier set not null,
  alter column rarity_tier set default 'Common',
  alter column weight set not null,
  alter column weight set default 10,
  alter column rarity_percent drop not null;
