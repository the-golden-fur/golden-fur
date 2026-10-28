import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The per-customer and per-stay tables the app normally fills as a side
 * effect, so the pages that read them aren't empty in a demo:
 *
 * - care_log_daily_reports: a "report sent" row for each day of each
 *   finished/active stay (up to yesterday, at most 5 per stay).
 * - customer_booking_milestone_progress: each customer's completed bookings.
 * - customer_pity_progress: spins since each customer's last pity win.
 * - customer_login_days: most of the last two weeks, per customer.
 *
 * These tables key on customer/stay rather than an id, so upserts conflict
 * on those keys (ignoreDuplicates - a re-run never overwrites).
 */

const DAY_MS = 86_400_000;
const MAX_REPORTS_PER_STAY = 5;
const LOGIN_DAYS = 14;

type Row = Record<string, unknown>;

function check<T extends { error: { message: string } | null }>(
  label: string,
  result: T
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function seedTempProgress(
  supabase: SupabaseClient,
  now = new Date()
) {
  const [customerRes, completedRes, stayRes] = await Promise.all([
    supabase.from('customer_profiles').select('id').order('created_at'),
    supabase
      .from('bookings')
      .select('customer_id')
      .eq('status', 'Completed')
      .limit(5000),
    supabase
      .from('stays')
      .select('id, check_in_at, scheduled_check_out_date, status')
      .in('status', ['Active', 'Completed'])
      .limit(500),
  ]);

  for (const r of [customerRes, completedRes, stayRes]) {
    if (r.error) throw r.error;
  }

  const customers = (customerRes.data ?? []).map((c) => c.id as string);
  if (!customers.length) {
    throw new Error('Base data missing for customer progress demo rows');
  }

  const completedBy = new Map<string, number>();
  for (const b of completedRes.data ?? []) {
    const id = b.customer_id as string;
    completedBy.set(id, (completedBy.get(id) ?? 0) + 1);
  }

  const today = Date.parse(isoDate(now.getTime()));

  const milestones: Row[] = customers.map((id) => ({
    customer_id: id,
    completed_bookings_count: completedBy.get(id) ?? 0,
  }));

  const pity: Row[] = customers.map((id, i) => ({
    customer_id: id,
    spins_since_last_pity_win: i % 4,
  }));

  const logins: Row[] = customers.flatMap((id, c) =>
    Array.from({ length: LOGIN_DAYS }, (_, d) => d)
      .filter((d) => (d + c) % 3 !== 2)
      .map((d) => {
        const day = today - (d + 1) * DAY_MS;
        return {
          customer_id: id,
          login_date: isoDate(day),
          created_at: new Date(day + 2 * 3_600_000).toISOString(),
        };
      })
  );

  const reports: Row[] = [];
  for (const stay of stayRes.data ?? []) {
    if (!stay.check_in_at) continue;
    const first = Date.parse(isoDate(Date.parse(stay.check_in_at as string)));
    const checkOut = stay.scheduled_check_out_date
      ? Date.parse(stay.scheduled_check_out_date as string)
      : first;
    const last = Math.min(checkOut, today - DAY_MS);
    for (
      let day = first, k = 0;
      day <= last && k < MAX_REPORTS_PER_STAY;
      day += DAY_MS, k++
    ) {
      reports.push({
        stay_id: stay.id,
        report_date: isoDate(day),
        // 18:00 Manila
        sent_at: new Date(day + 10 * 3_600_000).toISOString(),
      });
    }
  }

  const writes: Array<[string, string, Row[]]> = [
    ['customer_booking_milestone_progress', 'customer_id', milestones],
    ['customer_pity_progress', 'customer_id', pity],
    ['customer_login_days', 'customer_id,login_date', logins],
    ['care_log_daily_reports', 'stay_id,report_date', reports],
  ];

  for (const [table, onConflict, rows] of writes) {
    if (!rows.length) continue;
    check(
      table,
      await supabase
        .from(table)
        .upsert(rows, { onConflict, ignoreDuplicates: true })
    );
  }
}
