// Custom change (coupon spin wheel + weekly-recurring promos, session 86) -
// reference seed data for the two brand-new reward/promo pieces that need
// real ROWS, not just schema: the starter spin wheel reward catalog and a
// demo weekly-recurring promo.
//
// spin_wheel_config's own thresholds (bookings_milestone_interval,
// spend_threshold_amount, pity_threshold) are NOT seeded here - that
// singleton settings row is schema, not reference data, so it's written
// directly by migration 20260913196 itself via a real column DEFAULT +
// `insert ... default values`, the same way promo_cap_configuration/
// pricing_configuration already do. This file only ever seeds actual
// per-row reference data.
//
// Not part of one of the original M01-M14 modules (rewards/spin-wheel is a
// net-new feature), so this folder deliberately has no `mNN-` prefix -
// mirrors how out-of-module migrations use a `custom_` prefix instead of
// `mNN_`.
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at custom-rewards.seed.sql. Unlike the .sql file,
// this script is idempotent (safe to re-run against a database that already
// has these rows) via per-row existence checks rather than ON CONFLICT.
//
// Run via `npm run seed:all` (which invokes every seed script in order) -
// not wired into `npm run dev`. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (read from server/.env), migrations
// 20260913195-201, plus m01's seed (branches).

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

interface SpinWheelRewardSeed {
  label: string;
  discountType: 'Percentage' | 'Flat';
  value: number;
  rarityPercent: number;
}

// Rarity percentages sum to exactly 100 - satisfies the deferred
// check_spin_wheel_rewards_sum trigger from the very first insert. Five
// tiers spanning common to rare so the pity system has a real "lowest
// pool" (the PHP 250 flat reward) to demonstrate out of the box.
export const SPIN_WHEEL_REWARD_SEEDS: SpinWheelRewardSeed[] = [
  {
    label: '5% off your next booking',
    discountType: 'Percentage',
    value: 5,
    rarityPercent: 40,
  },
  {
    label: '10% off your next booking',
    discountType: 'Percentage',
    value: 10,
    rarityPercent: 30,
  },
  {
    label: '15% off your next booking',
    discountType: 'Percentage',
    value: 15,
    rarityPercent: 15,
  },
  {
    label: 'PHP 100 off',
    discountType: 'Flat',
    value: 100,
    rarityPercent: 10,
  },
  {
    label: 'PHP 250 off',
    discountType: 'Flat',
    value: 250,
    rarityPercent: 5,
  },
];

const WEEKLY_PROMO_NAME = 'Midweek Discount';

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

/**
 * All-or-nothing: only ever inserts when NONE of the seed rewards exist yet.
 * A partial insert would risk landing on a rarity sum that isn't 100
 * depending on which specific rows already exist (e.g. an admin already
 * added their own rewards) - safer to skip entirely and let an admin manage
 * the catalog by hand from that point on than to guess at a safe partial
 * insert.
 */
export async function seedSpinWheelRewards(
  supabase: ReturnType<typeof createClient>
) {
  const { data: existing, error } = await supabase
    .from('spin_wheel_rewards')
    .select('label');

  if (error) {
    console.error(`skip: could not list spin_wheel_rewards (${error.message})`);
    return;
  }

  if ((existing ?? []).length > 0) {
    console.log('skip: spin wheel rewards already seeded');
    return;
  }

  const { error: insertError } = await supabase
    .from('spin_wheel_rewards')
    .insert(
      SPIN_WHEEL_REWARD_SEEDS.map((reward) => ({
        label: reward.label,
        discount_type: reward.discountType,
        value: reward.value,
        rarity_percent: reward.rarityPercent,
        is_active: true,
      }))
    );

  if (insertError) {
    console.error(`spin_wheel_rewards insert failed: ${insertError.message}`);
    return;
  }

  console.log(`seeded ${SPIN_WHEEL_REWARD_SEEDS.length} spin wheel reward(s)`);
}

async function getBranches(supabase: ReturnType<typeof createClient>) {
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
export async function seedWeeklyRecurringPromo(
  supabase: ReturnType<typeof createClient>
) {
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

async function main() {
  const supabase = getClient();
  await seedSpinWheelRewards(supabase);
  await seedWeeklyRecurringPromo(supabase);
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
