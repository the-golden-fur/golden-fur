import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Months of finished, paid bookings behind the demo, so the Reports charts
 * (revenue, trends, branch comparison, goals) draw real curves instead of a
 * single spike on the day the seed ran.
 *
 * Covers the previous HISTORY_MONTHS months plus the current month up to
 * yesterday, per branch, with volume growing month over month. Every row is
 * backdated: bookings.created_at a few days before the visit,
 * transactions.created_at at the visit's end - the reporting RPCs bucket by
 * those columns.
 *
 * Fixed ids + upsert(ignoreDuplicates) keep re-runs from adding duplicates;
 * a re-run on a later day leaves the first run's dates as they were.
 */

const uuid = (kind: string, n: number) =>
  `6d000000-0000-4000-8000-${kind}${String(n).padStart(10, '0')}`;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const HISTORY_MONTHS = 6;

type Row = Record<string, unknown>;
type Service = {
  id: string;
  name: string;
  category: string;
  base_price: number;
  duration_minutes: number | null;
};
type Staff = { id: string; role: string; branch_id: string };

// Share of each month's visits per service category.
const CATEGORY_WEIGHTS: Array<[string, number]> = [
  ['Grooming', 45],
  ['Daycare', 20],
  ['Hotel', 20],
  ['Veterinary', 15],
];

const PAYMENT_WEIGHTS: Array<[string, number]> = [
  ['Cash', 45],
  ['GCash', 35],
  ['Maya', 10],
  ['Card', 10],
];

// Small deterministic PRNG so every run builds the same rows.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function weighted<T>(list: Array<[T, number]>, r: number): T {
  const total = list.reduce((sum, [, w]) => sum + w, 0);
  let x = r * total;
  for (const [value, w] of list) {
    if ((x -= w) < 0) return value;
  }
  return list[list.length - 1][0];
}

function check<T extends { error: { message: string } | null }>(
  label: string,
  result: T
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

export async function seedTempHistory(
  supabase: SupabaseClient,
  now = new Date()
) {
  const [branchRes, staffRes, petRes, servicesRes] = await Promise.all([
    supabase.from('branches').select('id, is_vet_branch').order('created_at'),
    supabase
      .from('staff_profiles')
      .select('id, role, branch_id')
      .eq('is_active', true)
      .order('created_at'),
    supabase
      .from('pets')
      .select('id, customer_id')
      .order('created_at')
      .limit(200),
    supabase
      .from('services')
      .select('id, name, category, base_price, duration_minutes')
      .is('archived_at', null)
      .eq('is_active', true),
  ]);

  for (const r of [branchRes, staffRes, petRes, servicesRes]) {
    if (r.error) throw r.error;
  }

  const branches = (branchRes.data ?? []) as Array<{
    id: string;
    is_vet_branch: boolean | null;
  }>;
  const staff = (staffRes.data ?? []) as Staff[];
  const pets = (petRes.data ?? []).filter((p) => p.customer_id) as Array<{
    id: string;
    customer_id: string;
  }>;
  const services = (servicesRes.data ?? []) as Service[];

  if (!branches.length || !staff.length || !pets.length) {
    throw new Error('Base data missing for booking history demo rows');
  }

  const servicesBy = (category: string) =>
    services.filter((s) => s.category === category);
  const staffAt = (branchId: string, roles: string[]) => {
    const atBranch = staff.filter((s) => s.branch_id === branchId);
    const local = atBranch.filter((s) => roles.includes(s.role));
    if (local.length) return local;
    return atBranch.length ? atBranch : staff;
  };

  const bookings: Row[] = [];
  const bookingItems: Row[] = [];
  const transactions: Row[] = [];
  const lineItems: Row[] = [];

  const rand = mulberry32(20261028);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const cutoff = now.getTime() - HOUR_MS;

  for (let back = HISTORY_MONTHS; back >= 0; back--) {
    const monthStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - back,
      1
    );
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0)
    ).getUTCDate();
    const monthIndex = HISTORY_MONTHS - back;

    branches.forEach((branch, b) => {
      // The first branch is the busier one; both grow month over month.
      const visits = (b === 0 ? 26 : 18) + monthIndex * 4;
      const categories = CATEGORY_WEIGHTS.filter(
        ([c]) =>
          servicesBy(c).length && (c !== 'Veterinary' || branch.is_vet_branch)
      );
      if (!categories.length) return;

      const cashiers = staffAt(branch.id, [
        'Cashier',
        'Receptionist',
        'Front Desk',
      ]);
      const groomers = staffAt(branch.id, ['Groomer']);
      const vets = staffAt(branch.id, ['Veterinarian']);

      for (let i = 0; i < visits; i++) {
        const n = (monthIndex * 10 + b) * 1000 + i + 1;
        const category = weighted(categories, rand());
        const service = pick(servicesBy(category));
        const pet = pick(pets);
        const day = Math.floor(rand() * daysInMonth);
        const hour = 1 + Math.floor(rand() * 7); // 09:00-15:00 Manila
        const start = monthStart + day * DAY_MS + hour * HOUR_MS;
        const nights = category === 'Hotel' ? 1 + Math.floor(rand() * 4) : 1;
        const minutes =
          category === 'Hotel'
            ? nights * 1440
            : (service.duration_minutes ?? (category === 'Daycare' ? 480 : 60));
        const end = start + minutes * 60_000;
        if (end > cutoff) continue;

        const price = Number(service.base_price) * nights;
        const actor = pick(cashiers);
        const bookingId = uuid('71', n);
        const assigned =
          category === 'Grooming'
            ? pick(groomers).id
            : category === 'Veterinary'
              ? pick(vets).id
              : null;

        bookings.push({
          id: bookingId,
          customer_id: pet.customer_id,
          pet_id: pet.id,
          branch_id: branch.id,
          created_by_staff_id: actor.id,
          assigned_staff_id: assigned,
          service_category: category,
          booking_source: rand() < 0.4 ? 'Walk-in' : 'Online',
          scheduled_start: new Date(start).toISOString(),
          scheduled_end: new Date(end).toISOString(),
          status: 'Completed',
          total_price: price,
          discount_amount: 0,
          promo_amount: 0,
          payment_status: 'Fully Paid',
          payment_confirmed: true,
          paid_at: new Date(end).toISOString(),
          reschedule_count: 0,
          downpayment_required: false,
          pay_at_checkout: false,
          created_at: new Date(
            start - (1 + Math.floor(rand() * 6)) * DAY_MS
          ).toISOString(),
        });

        bookingItems.push({
          id: uuid('72', n),
          booking_id: bookingId,
          service_id: service.id,
          price_at_booking: price,
          duration_minutes_at_booking: minutes,
        });

        const txnId = uuid('73', n);
        transactions.push({
          id: txnId,
          booking_id: bookingId,
          customer_id: pet.customer_id,
          branch_id: branch.id,
          transaction_type: 'booking_payment',
          payment_method: weighted(PAYMENT_WEIGHTS, rand()),
          payment_status: 'Fully Paid',
          subtotal_amount: price,
          discount_amount: 0,
          promo_amount: 0,
          credit_applied_amount: 0,
          total_amount: price,
          processed_by_staff_id: actor.id,
          payment_choice: 'full',
          created_at: new Date(end).toISOString(),
        });

        lineItems.push({
          id: uuid('74', n),
          transaction_id: txnId,
          line_item_type: 'service',
          reference_id: service.id,
          description:
            nights > 1 ? `${service.name} x ${nights}` : service.name,
          quantity: nights,
          unit_price: Number(service.base_price),
          line_total: price,
        });
      }
    });
  }

  const writes: Array<[string, Row[]]> = [
    ['bookings', bookings],
    ['booking_items', bookingItems],
    ['transactions', transactions],
    ['transaction_line_items', lineItems],
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
