import type { SupabaseClient } from '@supabase/supabase-js';

const PER_CATEGORY = 16;

const uuid = (kind: string, n: number) =>
  `6d000000-0000-4000-8000-${kind}${String(n).padStart(10, '0')}`;

const CATEGORIES = ['Grooming', 'Hotel', 'Daycare'] as const;
type Category = (typeof CATEGORIES)[number];

const DURATION: Record<Category, number> = {
  Grooming: 60,
  Hotel: 1440,
  Daycare: 480,
};

function check<T extends { error: { message: string } | null }>(
  label: string,
  result: T
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

export async function seedTempTransactions(supabase: SupabaseClient) {
  const [
    petRes,
    branchRes,
    cageRes,
    staffRes,
    servicesRes,
    promoRes,
    rewardRes,
    poolRes,
    customerRes,
  ] = await Promise.all([
    supabase
      .from('pets')
      .select('id, customer_id')
      .order('created_at')
      .limit(200),
    supabase.from('branches').select('id').order('created_at').limit(2),
    supabase
      .from('cages')
      .select('id, branch_id')
      .is('archived_at', null)
      .limit(200),
    supabase
      .from('staff_profiles')
      .select('id, branch_id')
      .order('created_at')
      .limit(50),
    supabase
      .from('services')
      .select('id, category, base_price, duration_minutes')
      .is('archived_at', null)
      .eq('is_active', true),
    supabase.from('promos').select('id').limit(5),
    supabase.from('spin_wheel_rewards').select('id').limit(6),
    supabase.from('reward_pools').select('id').limit(2),
    supabase
      .from('customer_profiles')
      .select('id')
      .order('created_at')
      .limit(20),
  ]);

  for (const r of [
    petRes,
    branchRes,
    cageRes,
    staffRes,
    servicesRes,
    promoRes,
    rewardRes,
    poolRes,
    customerRes,
  ]) {
    if (r.error) throw r.error;
  }

  const pets = (petRes.data ?? []).filter((p) => p.customer_id);
  const branches = (branchRes.data ?? []).map((b) => b.id as string);
  const cages = cageRes.data ?? [];
  const staff = staffRes.data ?? [];
  const services = servicesRes.data ?? [];
  const promos = (promoRes.data ?? []).map((p) => p.id as string);
  const rewards = (rewardRes.data ?? []).map((r) => r.id as string);
  const pools = (poolRes.data ?? []).map((p) => p.id as string);
  const customers = (customerRes.data ?? []).map((c) => c.id as string);

  if (!pets.length || !branches.length || !staff.length || !customers.length) {
    throw new Error('Base data missing for transactional demo rows');
  }

  const bookings: Record<string, unknown>[] = [];
  const bookingItems: Record<string, unknown>[] = [];
  const transactions: Record<string, unknown>[] = [];
  const lineItems: Record<string, unknown>[] = [];
  const stays: Record<string, unknown>[] = [];
  const feeding: Record<string, unknown>[] = [];
  const staffPrefs: Record<string, unknown>[] = [];
  const spinCredits: Record<string, unknown>[] = [];
  const spinHistory: Record<string, unknown>[] = [];
  const coupons: Record<string, unknown>[] = [];

  const base = Date.UTC(2026, 9, 10, 1, 0, 0);
  let seq = 0;

  for (const category of CATEGORIES) {
    const service = services.find((s) => s.category === category);
    if (!service) throw new Error(`No active ${category} service to book`);

    for (let i = 0; i < PER_CATEGORY; i++) {
      seq += 1;
      const pet = pets[seq % pets.length];
      const branchId = branches[seq % branches.length];
      const actor = staff[seq % staff.length];
      const start = new Date(base + seq * 86_400_000);
      const duration = DURATION[category];
      const end = new Date(start.getTime() + duration * 60_000);
      const isPast = i < PER_CATEGORY / 2;
      const status = isPast
        ? 'Completed'
        : i === PER_CATEGORY - 1
          ? 'Cancelled'
          : 'Pending';
      const paid = status !== 'Cancelled';
      const price = Number(service.base_price);
      const bookingId = uuid('a1', seq);

      bookings.push({
        id: bookingId,
        customer_id: pet.customer_id,
        pet_id: pet.id,
        branch_id: branchId,
        created_by_staff_id: actor.id,
        service_category: category,
        booking_source: i % 3 === 0 ? 'Walk-in' : 'Online',
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        status,
        total_price: price,
        discount_amount: 0,
        promo_amount: 0,
        payment_status: paid ? 'Fully Paid' : 'Pending',
        payment_confirmed: paid,
        paid_at: paid ? start.toISOString() : null,
        reschedule_count: 0,
        downpayment_required: false,
        pay_at_checkout: false,
      });

      bookingItems.push({
        id: uuid('a2', seq),
        booking_id: bookingId,
        service_id: service.id,
        price_at_booking: price,
        duration_minutes_at_booking: service.duration_minutes ?? duration,
      });

      if (paid) {
        const txnId = uuid('a3', seq);
        transactions.push({
          id: txnId,
          booking_id: bookingId,
          customer_id: pet.customer_id,
          branch_id: branchId,
          transaction_type: 'booking_payment',
          payment_method: i % 2 === 0 ? 'Cash' : 'GCash',
          payment_status: 'Fully Paid',
          subtotal_amount: price,
          discount_amount: 0,
          promo_amount: 0,
          credit_applied_amount: 0,
          total_amount: price,
          processed_by_staff_id: actor.id,
          payment_choice: 'full',
        });
        lineItems.push({
          id: uuid('a4', seq),
          transaction_id: txnId,
          line_item_type: 'service',
          reference_id: service.id,
          description: `${category} service`,
          quantity: 1,
          unit_price: price,
          line_total: price,
        });
      }

      if (category === 'Grooming') {
        staffPrefs.push({
          id: uuid('a7', seq),
          booking_id: bookingId,
          preference_type: 'no_preference',
          staff_picker_shown: true,
        });
      }

      if (category !== 'Grooming' && status !== 'Cancelled') {
        const cage = cages.find((c) => c.branch_id === branchId) ?? cages[0];
        const stayId = uuid('a5', seq);
        stays.push({
          id: stayId,
          booking_id: bookingId,
          pet_id: pet.id,
          cage_id: cage.id,
          branch_id: branchId,
          stay_type: category,
          status: isPast ? 'Completed' : 'Active',
          check_in_at: start.toISOString(),
          scheduled_check_out_date: end.toISOString().slice(0, 10),
          downpayment_amount: 0,
          notify_opt_in: false,
          created_by_staff_id: actor.id,
        });
        if (category === 'Hotel') {
          feeding.push({
            id: uuid('a8', seq),
            stay_id: stayId,
            meal_time: 'Morning',
            food_type: 'Dry kibble',
            quantity: '1',
            quantity_unit: 'cup',
          });
        }
      }

      if (seq <= 15) {
        const promoId = promos[seq % Math.max(promos.length, 1)] ?? null;
        const creditId = uuid('aa', seq);
        spinCredits.push({
          id: creditId,
          customer_id: pet.customer_id,
          source: 'booking_milestone',
          source_booking_id: bookingId,
          is_consumed: true,
          consumed_at: start.toISOString(),
          promo_id: promoId,
        });
        const historyId = uuid('ab', seq);
        spinHistory.push({
          id: historyId,
          customer_id: pet.customer_id,
          spin_wheel_reward_id: rewards[seq % Math.max(rewards.length, 1)],
          spin_credit_id: creditId,
          was_pity: false,
          promo_id: promoId,
          reward_pool_id: pools[seq % Math.max(pools.length, 1)],
        });
        coupons.push({
          id: uuid('a9', seq),
          customer_id: customers[seq % customers.length],
          discount_type: seq % 2 === 0 ? 'Percentage' : 'Flat',
          value: seq % 2 === 0 ? 10 : 100,
          is_redeemed: false,
          expires_at: new Date(Date.UTC(2026, 11, 31)).toISOString(),
          spin_history_id: historyId,
        });
      }
    }
  }

  const writes: Array<[string, Record<string, unknown>[]]> = [
    ['bookings', bookings],
    ['booking_items', bookingItems],
    ['transactions', transactions],
    ['transaction_line_items', lineItems],
    ['stays', stays],
    ['care_feeding_instructions', feeding],
    ['staff_picker_preferences', staffPrefs],
    ['customer_spin_credits', spinCredits],
    ['spin_history', spinHistory],
    ['customer_coupons', coupons],
  ];

  for (const [table, rows] of writes) {
    if (!rows.length) continue;
    check(
      table,
      await supabase
        .from(table)
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    );
  }
}
