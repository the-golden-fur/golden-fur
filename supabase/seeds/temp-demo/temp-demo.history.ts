import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Months of finished bookings behind the demo, so the Reports charts
 * (revenue, trends, branch comparison, goals) draw real curves instead of a
 * single spike on the day the seed ran.
 *
 * Two windows, per branch, with volume growing month over month:
 *
 * - Recent: the previous HISTORY_MONTHS months plus the current month up to
 *   yesterday - every visit Completed and paid (ids 71-74).
 * - Deep: months HISTORY_MONTHS+1 to DEEP_HISTORY_MONTHS back, quieter, with
 *   realistic outcomes - mostly Completed and paid, some Cancelled (with a
 *   cancellation log) and No-show (no payment). Completed grooming visits get
 *   a grooming session; completed hotel/daycare visits a finished stay with
 *   check-in/check-out activity (ids 75-7c).
 *
 * Every row is backdated: bookings.created_at a few days before the visit,
 * transactions.created_at at the visit's end - the reporting RPCs bucket by
 * those columns. The two windows draw from separate PRNG streams, so the
 * recent window builds exactly the same rows it always has.
 *
 * Fixed ids + upsert(ignoreDuplicates) keep re-runs from adding duplicates;
 * a re-run on a later day leaves the first run's dates as they were.
 */

const uuid = (kind: string, n: number) =>
  `6d000000-0000-4000-8000-${kind}${String(n).padStart(10, '0')}`;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const HISTORY_MONTHS = 6;
const DEEP_HISTORY_MONTHS = 12;

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

type HistoryWindow = {
  fromBack: number; // oldest month, in months before the current one
  toBack: number; // newest month
  seed: number;
  // booking, item, txn, line[, session, stay, cancellation log, activity]
  kinds: string[];
  visits: (branchIndex: number, back: number) => number;
  outcomes: boolean; // false = every visit Completed and paid
};

export async function seedTempHistory(
  supabase: SupabaseClient,
  now = new Date()
) {
  const [branchRes, staffRes, petRes, servicesRes, cageRes] = await Promise.all(
    [
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
      supabase
        .from('cages')
        .select('id, branch_id')
        .is('archived_at', null)
        .order('cage_label'),
    ]
  );

  for (const r of [branchRes, staffRes, petRes, servicesRes, cageRes]) {
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
  const cages = (cageRes.data ?? []) as Array<{
    id: string;
    branch_id: string;
  }>;

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
  const sessions: Row[] = [];
  const stays: Row[] = [];
  const cancellationLogs: Row[] = [];
  const activity: Row[] = [];

  const cutoff = now.getTime() - HOUR_MS;
  const iso = (ms: number) => new Date(ms).toISOString();

  const buildWindow = (w: HistoryWindow) => {
    const rand = mulberry32(w.seed);
    const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
    const [kBooking, kItem, kTxn, kLine, kSession, kStay, kLog, kActivity] =
      w.kinds;

    for (let back = w.fromBack; back >= w.toBack; back--) {
      const monthStart = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - back,
        1
      );
      const daysInMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0)
      ).getUTCDate();
      const monthIndex = w.fromBack - back;

      branches.forEach((branch, b) => {
        const visits = w.visits(b, back);
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
        const branchCage = cages.find((c) => c.branch_id === branch.id)?.id;

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
              : (service.duration_minutes ??
                (category === 'Daycare' ? 480 : 60));
          const end = start + minutes * 60_000;
          if (end > cutoff) continue;

          const price = Number(service.base_price) * nights;
          const actor = pick(cashiers);
          const bookingId = uuid(kBooking, n);
          const assigned =
            category === 'Grooming'
              ? pick(groomers).id
              : category === 'Veterinary'
                ? pick(vets).id
                : null;
          // Draw order (source, then created_at) matches the original seed.
          const source = rand() < 0.4 ? 'Walk-in' : 'Online';
          const createdAt = start - (1 + Math.floor(rand() * 6)) * DAY_MS;

          let status = 'Completed';
          if (w.outcomes) {
            const r = rand();
            if (r < 0.09) status = 'Cancelled';
            else if (r < 0.15) status = 'No-show';
          }
          const paid = status === 'Completed';
          const cancelledAt = createdAt + HOUR_MS;

          bookings.push({
            id: bookingId,
            customer_id: pet.customer_id,
            pet_id: pet.id,
            branch_id: branch.id,
            created_by_staff_id: actor.id,
            assigned_staff_id: assigned,
            service_category: category,
            booking_source: source,
            scheduled_start: iso(start),
            scheduled_end: iso(end),
            status,
            total_price: price,
            discount_amount: 0,
            promo_amount: 0,
            payment_status: paid ? 'Fully Paid' : 'Pending',
            payment_confirmed: paid,
            paid_at: paid ? iso(end) : null,
            reschedule_count: 0,
            downpayment_required: false,
            pay_at_checkout: false,
            created_at: iso(createdAt),
            ...(w.outcomes && paid
              ? { started_at: iso(start), completed_at: iso(end) }
              : {}),
            ...(status === 'Cancelled'
              ? {
                  cancelled_at: iso(cancelledAt),
                  cancellation_reason: 'Owner has a schedule conflict',
                }
              : {}),
          });

          bookingItems.push({
            id: uuid(kItem, n),
            booking_id: bookingId,
            service_id: service.id,
            price_at_booking: price,
            duration_minutes_at_booking: minutes,
          });

          if (status === 'Cancelled') {
            cancellationLogs.push({
              id: uuid(kLog, n),
              booking_id: bookingId,
              customer_id: pet.customer_id,
              branch_id: branch.id,
              event_type: 'cancellation',
              notice_period_met: true,
              enforcement_mode_applied: 'Strict',
              policy_violation: false,
              credit_issued: false,
              credit_review_status: 'not_applicable',
              created_at: iso(cancelledAt),
            });
          }
          if (!paid) continue;

          const txnId = uuid(kTxn, n);
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
            created_at: iso(end),
          });

          lineItems.push({
            id: uuid(kLine, n),
            transaction_id: txnId,
            line_item_type: 'service',
            reference_id: service.id,
            description:
              nights > 1 ? `${service.name} x ${nights}` : service.name,
            quantity: nights,
            unit_price: Number(service.base_price),
            line_total: price,
          });

          if (!w.outcomes) continue;

          if (category === 'Grooming' && assigned) {
            sessions.push({
              id: uuid(kSession, n),
              booking_id: bookingId,
              assigned_groomer_id: assigned,
              queue_position: null,
            });
          }

          if ((category === 'Hotel' || category === 'Daycare') && branchCage) {
            const stayId = uuid(kStay, n);
            stays.push({
              id: stayId,
              booking_id: bookingId,
              pet_id: pet.id,
              cage_id: branchCage, // a finished stay doesn't hold its cage
              branch_id: branch.id,
              stay_type: category,
              status: 'Completed',
              check_in_at: iso(start),
              scheduled_check_out_date: iso(end).slice(0, 10),
              actual_check_out_at: iso(end),
              downpayment_amount: 0,
              notify_opt_in: false,
              created_by_staff_id: actor.id,
              service_id: service.id,
            });
            activity.push(
              {
                id: uuid(kActivity, n * 2),
                branch_id: branch.id,
                stay_id: stayId,
                action: 'check_in',
                actor_staff_id: actor.id,
                description: `Checked in for a ${category} stay`,
                created_at: iso(start),
              },
              {
                id: uuid(kActivity, n * 2 + 1),
                branch_id: branch.id,
                stay_id: stayId,
                action: 'check_out',
                actor_staff_id: actor.id,
                description: `Checked out from a ${category} stay`,
                created_at: iso(end),
              }
            );
          }
        }
      });
    }
  };

  // Recent window: same ids, seed and volumes as the original seed.
  buildWindow({
    fromBack: HISTORY_MONTHS,
    toBack: 0,
    seed: 20261028,
    kinds: ['71', '72', '73', '74'],
    // The first branch is the busier one; both grow month over month.
    visits: (b, back) => (b === 0 ? 26 : 18) + (HISTORY_MONTHS - back) * 4,
    outcomes: false,
  });

  // Deep window: quieter months leading up to the recent window.
  buildWindow({
    fromBack: DEEP_HISTORY_MONTHS,
    toBack: HISTORY_MONTHS + 1,
    seed: 20261113,
    kinds: ['75', '76', '77', '78', '79', '7a', '7b', '7c'],
    visits: (b, back) => (b === 0 ? 14 : 10) + (DEEP_HISTORY_MONTHS - back) * 2,
    outcomes: true,
  });

  // Parents before children: stays before the activity rows that cite them.
  const writes: Array<[string, Row[]]> = [
    ['bookings', bookings],
    ['booking_items', bookingItems],
    ['transactions', transactions],
    ['transaction_line_items', lineItems],
    ['grooming_sessions', sessions],
    ['stays', stays],
    ['cancellation_logs', cancellationLogs],
    ['activity_log', activity],
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
