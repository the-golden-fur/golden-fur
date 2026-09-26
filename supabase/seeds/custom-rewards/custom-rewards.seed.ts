// Custom change (coupon spin wheel + weekly-recurring promos, session 86;
// reward pools + spin-wheel promos, session 114) - reference seed data for
// the reward/promo pieces that need real ROWS, not just schema:
//
//   1. the starter spin wheel reward catalog (rarity tier + weight - a
//      reward's chance is weight / total weight within its pool, so nothing
//      has to add up to 100 any more),
//   2. two reward pools - "Standard" (the original five rewards) and a demo
//      "Rare Rewards" pool (Rare/Epic/Legendary only),
//   3. a demo weekly-recurring promo ("Midweek Discount"),
//   4. a demo spin-wheel promo ("Monthly Login Bonus": a 5-day login streak
//      within a month spins the Rare Rewards pool, pity 3).
//
// The "Standard" pool itself and the "Loyalty Spin" spin-wheel promo that
// replaced the old global spin_wheel_config are created by migration
// 20260925213 (so they exist in every environment, not just after a
// `db reset`); on a fresh reset that migration runs BEFORE this seed, finds
// no rewards yet, and leaves Standard empty - step 2 below fills it.
//
// Not part of one of the original M01-M14 modules (rewards/spin-wheel is a
// net-new feature), so this folder deliberately has no `mNN-` prefix -
// mirrors how out-of-module migrations use a `custom_` prefix instead of
// `mNN_`.
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at custom-rewards.seed.sql. Both are idempotent (safe
// to re-run against a database that already has these rows) via per-row
// existence checks.
//
// Run via `npm run seed:all` (which invokes every seed script in order) -
// not wired into `npm run dev`. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (read from server/.env), migrations through
// 20260925215, plus m01's seed (branches).

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

type RarityTier = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

interface SpinWheelRewardSeed {
  label: string;
  discountType: 'Percentage' | 'Flat';
  value: number;
  rarityTier: RarityTier;
  weight: number;
}

// The original five rewards keep their old odds as weights (40/30/15/10/5 -
// the same conversion migration 20260925209 applies to existing rows), plus
// one Epic reward so the demo Rare Rewards pool has three tiers.
export const SPIN_WHEEL_REWARD_SEEDS: SpinWheelRewardSeed[] = [
  {
    label: '5% off your next booking',
    discountType: 'Percentage',
    value: 5,
    rarityTier: 'Common',
    weight: 40,
  },
  {
    label: '10% off your next booking',
    discountType: 'Percentage',
    value: 10,
    rarityTier: 'Common',
    weight: 30,
  },
  {
    label: '15% off your next booking',
    discountType: 'Percentage',
    value: 15,
    rarityTier: 'Uncommon',
    weight: 15,
  },
  {
    label: 'PHP 100 off',
    discountType: 'Flat',
    value: 100,
    rarityTier: 'Rare',
    weight: 10,
  },
  {
    label: '20% off your next booking',
    discountType: 'Percentage',
    value: 20,
    rarityTier: 'Epic',
    weight: 8,
  },
  {
    label: 'PHP 250 off',
    discountType: 'Flat',
    value: 250,
    rarityTier: 'Legendary',
    weight: 5,
  },
];

export const STANDARD_POOL_NAME = 'Standard';
export const RARE_POOL_NAME = 'Rare Rewards';

/** Pool name -> reward labels. Standard = the original five. */
export const REWARD_POOL_SEEDS: Array<{
  name: string;
  description: string;
  rewardLabels: string[];
}> = [
  {
    name: STANDARD_POOL_NAME,
    description:
      'The original spin wheel reward list, converted automatically when reward pools were introduced.',
    rewardLabels: [
      '5% off your next booking',
      '10% off your next booking',
      '15% off your next booking',
      'PHP 100 off',
      'PHP 250 off',
    ],
  },
  {
    name: RARE_POOL_NAME,
    description: 'Only the rarest rewards - for loyal, frequent visitors.',
    rewardLabels: ['PHP 100 off', '20% off your next booking', 'PHP 250 off'],
  },
];

const WEEKLY_PROMO_NAME = 'Midweek Discount';
export const MONTHLY_LOGIN_PROMO_NAME = 'Monthly Login Bonus';

type Client = ReturnType<typeof createClient>;

function getClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see server/.env).'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

/** Per-row: inserts any seed reward whose label doesn't exist yet. Safe now
 * that there's no sum-to-100 rule - a partial insert can't leave the
 * catalog in an invalid state. */
export async function seedSpinWheelRewards(supabase: Client) {
  const { data: existing, error } = await supabase
    .from('spin_wheel_rewards')
    .select('id, label');

  if (error) {
    console.error(`skip: could not list spin_wheel_rewards (${error.message})`);
    return;
  }

  const existingLabels = new Set(
    ((existing ?? []) as Array<{ label: string }>).map((row) => row.label)
  );
  const missing = SPIN_WHEEL_REWARD_SEEDS.filter(
    (reward) => !existingLabels.has(reward.label)
  );

  if (missing.length === 0) {
    console.log('skip: spin wheel rewards already seeded');
    return;
  }

  const { error: insertError } = await supabase
    .from('spin_wheel_rewards')
    .insert(
      missing.map((reward) => ({
        label: reward.label,
        discount_type: reward.discountType,
        value: reward.value,
        rarity_tier: reward.rarityTier,
        weight: reward.weight,
        is_active: true,
      }))
    );

  if (insertError) {
    console.error(`spin_wheel_rewards insert failed: ${insertError.message}`);
    return;
  }

  console.log(`seeded ${missing.length} spin wheel reward(s)`);
}

async function ensurePool(
  supabase: Client,
  name: string,
  description: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('reward_pools')
    .select('id')
    .eq('name', name)
    .is('archived_at', null)
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await supabase
    .from('reward_pools')
    .insert({ name, description })
    .select('id')
    .maybeSingle();

  if (error || !created) {
    console.error(
      `reward_pools insert failed (${name}): ${error?.message ?? 'unknown error'}`
    );
    return null;
  }

  console.log(`created reward pool ${name}`);
  return (created as { id: string }).id;
}

/** Creates any missing pool and attaches any missing member rewards (by
 * label). Never removes a member an admin added by hand. */
export async function seedRewardPools(supabase: Client) {
  const { data: rewards, error } = await supabase
    .from('spin_wheel_rewards')
    .select('id, label');

  if (error) {
    console.error(`skip: could not list spin_wheel_rewards (${error.message})`);
    return;
  }

  const rewardIdByLabel = new Map(
    ((rewards ?? []) as Array<{ id: string; label: string }>).map((row) => [
      row.label,
      row.id,
    ])
  );

  for (const poolSeed of REWARD_POOL_SEEDS) {
    const poolId = await ensurePool(
      supabase,
      poolSeed.name,
      poolSeed.description
    );
    if (!poolId) continue;

    const { data: members } = await supabase
      .from('reward_pool_rewards')
      .select('spin_wheel_reward_id')
      .eq('reward_pool_id', poolId);

    const memberIds = new Set(
      ((members ?? []) as Array<{ spin_wheel_reward_id: string }>).map(
        (row) => row.spin_wheel_reward_id
      )
    );

    const missing = poolSeed.rewardLabels
      .map((label) => rewardIdByLabel.get(label))
      .filter((id): id is string => id !== undefined && !memberIds.has(id));

    if (missing.length === 0) continue;

    const { error: insertError } = await supabase
      .from('reward_pool_rewards')
      .insert(
        missing.map((rewardId) => ({
          reward_pool_id: poolId,
          spin_wheel_reward_id: rewardId,
        }))
      );

    if (insertError) {
      console.error(
        `reward_pool_rewards insert failed (${poolSeed.name}): ${insertError.message}`
      );
    } else {
      console.log(`attached ${missing.length} reward(s) to ${poolSeed.name}`);
    }
  }
}

async function getBranches(supabase: Client) {
  const { data, error } = await supabase.from('branches').select('id, name');

  if (error || !data?.length) {
    console.error(
      `skip: could not list branches - has m01's seed run? (${error?.message ?? 'no branches found'})`
    );
    return [];
  }

  return data as { id: string; name: string }[];
}

/** Demo weekly-recurring promo ("every Tuesday/Wednesday, 10% off") - gives
 * the Promos admin page and the new booking-time Promos & Coupons step a
 * real weekly_recurring row out of the box, same reason
 * m13-maintenance.seed.ts's own PROMO_SEEDS exist for the date-range type. */
export async function seedWeeklyRecurringPromo(supabase: Client) {
  const branches = await getBranches(supabase);
  if (branches.length === 0) return;

  const { data: existingPromo } = await supabase
    .from('promos')
    .select('id')
    .eq('name', WEEKLY_PROMO_NAME)
    .maybeSingle();

  let promoId = existingPromo?.id as string | undefined;

  if (promoId) {
    console.log(`skip: ${WEEKLY_PROMO_NAME} already seeded`);
  } else {
    const { data: created, error: createError } = await supabase
      .from('promos')
      .insert({
        name: WEEKLY_PROMO_NAME,
        promo_type: 'weekly_recurring',
        days_of_week: [2, 3], // Tuesday, Wednesday
        discount_type: 'Percentage',
        value: 10,
        scope_type: 'all_services',
        is_active: true,
      })
      .select('id')
      .maybeSingle();

    if (createError || !created) {
      console.error(
        `${WEEKLY_PROMO_NAME} insert failed: ${createError?.message ?? 'unknown error'}`
      );
      return;
    }

    promoId = created.id as string;
    console.log(`created ${WEEKLY_PROMO_NAME}`);
  }

  const { data: existingAvailability } = await supabase
    .from('promo_branch_availability')
    .select('branch_id')
    .eq('promo_id', promoId);

  const availableBranchIds = new Set(
    (existingAvailability ?? []).map((row) => row.branch_id as string)
  );
  const missingBranches = branches.filter(
    (branch) => !availableBranchIds.has(branch.id)
  );

  if (missingBranches.length > 0) {
    const { error: availabilityError } = await supabase
      .from('promo_branch_availability')
      .insert(
        missingBranches.map((branch) => ({
          promo_id: promoId,
          branch_id: branch.id,
          is_available: true,
        }))
      );

    if (availabilityError) {
      console.error(
        `promo_branch_availability insert failed (${WEEKLY_PROMO_NAME}): ${availabilityError.message}`
      );
    }
  }
}

/** Demo spin-wheel promo: a 5-day login streak within a calendar month
 * earns one spin on the Rare Rewards pool, with pity after 3 spins. No
 * branch availability rows - spin-wheel promos are customer-wide. */
export async function seedMonthlyLoginSpinPromo(supabase: Client) {
  const { data: pool } = await supabase
    .from('reward_pools')
    .select('id')
    .eq('name', RARE_POOL_NAME)
    .is('archived_at', null)
    .maybeSingle();

  if (!pool) {
    console.error(`skip: ${RARE_POOL_NAME} pool not found`);
    return;
  }

  const { data: existingPromo } = await supabase
    .from('promos')
    .select('id')
    .eq('name', MONTHLY_LOGIN_PROMO_NAME)
    .maybeSingle();

  let promoId = existingPromo?.id as string | undefined;

  if (!promoId) {
    const { data: created, error: createError } = await supabase
      .from('promos')
      .insert({
        name: MONTHLY_LOGIN_PROMO_NAME,
        promo_type: 'spin_wheel',
        is_active: true,
      })
      .select('id')
      .maybeSingle();

    if (createError || !created) {
      console.error(
        `${MONTHLY_LOGIN_PROMO_NAME} insert failed: ${createError?.message ?? 'unknown error'}`
      );
      return;
    }

    promoId = created.id as string;
    console.log(`created ${MONTHLY_LOGIN_PROMO_NAME}`);
  }

  const { data: existingSettings } = await supabase
    .from('spin_wheel_promo_settings')
    .select('promo_id')
    .eq('promo_id', promoId)
    .maybeSingle();

  if (existingSettings) {
    console.log(`skip: ${MONTHLY_LOGIN_PROMO_NAME} settings already seeded`);
    return;
  }

  const { error: settingsError } = await supabase
    .from('spin_wheel_promo_settings')
    .insert({
      promo_id: promoId,
      reward_pool_id: (pool as { id: string }).id,
      pity_threshold: 3,
      login_trigger: 'monthly_login_streak',
      login_streak_days: 5,
    });

  if (settingsError) {
    console.error(
      `spin_wheel_promo_settings insert failed (${MONTHLY_LOGIN_PROMO_NAME}): ${settingsError.message}`
    );
  }
}

async function main() {
  const supabase = getClient();
  await seedSpinWheelRewards(supabase);
  await seedRewardPools(supabase);
  await seedWeeklyRecurringPromo(supabase);
  await seedMonthlyLoginSpinPromo(supabase);
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
