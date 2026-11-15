import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Today's and upcoming bookings, staff attendance and bug reports, so the
 * staff dashboards and queues have something on every day the demo shows.
 *
 * - Today + the next SCHEDULE_DAYS days, per branch: grooming (with a
 *   grooming session, groomers round-robin), daycare, hotel check-ins and -
 *   on vet branches - veterinary appointments. Today's rows follow the clock
 *   at seed time: finished slots are Completed and paid, running ones In
 *   Progress, some past-due ones Late, the rest Pending. Future rows are
 *   Pending with a mix of paid / downpayment-paid / unpaid, plus a few
 *   Cancelled (with a cancellation log). Hotel/daycare arrivals get no stay
 *   row - that is created at check-in.
 * - Reminder notifications for the next two days, and "staff assigned"
 *   notifications for a sample of groomers' bookings.
 * - Staff attendance for the last ATTENDANCE_DAYS days plus today, Monday
 *   to Saturday, for every active staff member with a branch.
 * - A dozen bug reports / feature requests over the last 90 days.
 *
 * Fixed ids + upsert(ignoreDuplicates) keep re-runs from adding duplicates
 * (attendance relies on its unique staff/date pair instead); a re-run on a
 * later day leaves the first run's dates as they were.
 */

const uuid = (kind: string, n: number) =>
  `6d000000-0000-4000-8000-${kind}${String(n).padStart(10, '0')}`;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SCHEDULE_DAYS = 30;
const ATTENDANCE_DAYS = 60;

type Row = Record<string, unknown>;
type Pet = { id: string; customer_id: string };
type Staff = { id: string; role: string; branch_id: string | null };
type Service = {
  id: string;
  name: string;
  category: string;
  base_price: number;
  duration_minutes: number | null;
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function check<T extends { error: { message: string } | null }>(
  label: string,
  result: T
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

const BUG_REPORTS: Array<{
  category: 'bug' | 'feature_request';
  title: string;
  description: string;
}> = [
  {
    category: 'bug',
    title: 'Calendar skips a day on month change',
    description:
      'Moving from the last day of the month to the next shows the 2nd instead of the 1st.',
  },
  {
    category: 'feature_request',
    title: 'Export daily sales to CSV',
    description:
      'It would help closing if the Reports page could export the day as a CSV.',
  },
  {
    category: 'bug',
    title: 'Pet photo does not refresh after upload',
    description:
      'The old photo stays until the page is reloaded after uploading a new one.',
  },
  {
    category: 'feature_request',
    title: 'Remind owners about vaccination due dates',
    description:
      'Send a notification a week before a pet vaccination falls due.',
  },
  {
    category: 'bug',
    title: 'Queue position jumps after a walk-in',
    description:
      'Adding a walk-in grooming booking moves two pets ahead in the queue.',
  },
  {
    category: 'feature_request',
    title: 'Dark mode for the front desk console',
    description: 'The evening shift would like a darker theme.',
  },
  {
    category: 'bug',
    title: 'GCash reference number gets cut off',
    description:
      'Long reference numbers are truncated on the transaction receipt.',
  },
  {
    category: 'feature_request',
    title: 'Let customers rebook a past service',
    description:
      'A "book again" button on a finished booking would save a few taps.',
  },
  {
    category: 'bug',
    title: 'Hotel check-out time shows in UTC',
    description: 'The stay summary shows the check-out time 8 hours early.',
  },
  {
    category: 'feature_request',
    title: 'Groomer notes visible to the owner',
    description: 'Owners asked to see the groomer notes after the session.',
  },
  {
    category: 'bug',
    title: 'Discount badge overlaps the price on mobile',
    description: 'On small screens the Senior Citizen badge covers the total.',
  },
  {
    category: 'feature_request',
    title: 'Weekly attendance summary for supervisors',
    description:
      'A weekly view of late and absent days per staff member would help.',
  },
];

export async function seedTempSchedule(
  supabase: SupabaseClient,
  now = new Date()
) {
  const [branchRes, staffRes, petRes, servicesRes, customerRes] =
    await Promise.all([
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
        .from('customer_profiles')
        .select('id')
        .order('created_at')
        .limit(10),
    ]);

  for (const r of [branchRes, staffRes, petRes, servicesRes, customerRes]) {
    if (r.error) throw r.error;
  }

  const branches = (branchRes.data ?? []) as Array<{
    id: string;
    is_vet_branch: boolean | null;
  }>;
  const staff = (staffRes.data ?? []) as Staff[];
  const pets = ((petRes.data ?? []) as Pet[]).filter((p) => p.customer_id);
  const services = (servicesRes.data ?? []) as Service[];
  const customers = (customerRes.data ?? []).map((c) => c.id as string);

  if (!branches.length || !staff.length || !pets.length) {
    throw new Error('Base data missing for schedule demo rows');
  }

  const servicesBy = (category: string) =>
    services.filter((s) => s.category === category);
  const staffAt = (branchId: string, roles: string[]) => {
    const atBranch = staff.filter((s) => s.branch_id === branchId);
    const local = atBranch.filter((s) => roles.includes(s.role));
    if (local.length) return local;
    return atBranch.length ? atBranch : staff;
  };

  const nowMs = now.getTime();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  // Hours are UTC; +8 for Manila (01:00 UTC = 9:00 AM).
  const at = (dayOffset: number, hourUtc: number) =>
    today + dayOffset * DAY_MS + hourUtc * HOUR_MS;
  const iso = (ms: number) => new Date(ms).toISOString();

  const bookings: Row[] = [];
  const bookingItems: Row[] = [];
  const sessions: Row[] = [];
  const transactions: Row[] = [];
  const lineItems: Row[] = [];
  const cancellationLogs: Row[] = [];
  const notifications: Row[] = [];
  const attendance: Row[] = [];
  const bugReports: Row[] = [];

  const rand = mulberry32(20261113);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const between = (lo: number, hi: number) =>
    lo + Math.floor(rand() * (hi - lo + 1));

  // ── Bookings: today + the next SCHEDULE_DAYS days ──
  branches.forEach((branch, b) => {
    const desks = staffAt(branch.id, ['Front Desk', 'Receptionist', 'Cashier']);
    const groomers = staffAt(branch.id, ['Groomer']);
    const vets = staffAt(branch.id, ['Veterinarian']);

    for (let day = 0; day <= SCHEDULE_DAYS; day++) {
      const isToday = day === 0;
      // Manila weekday of this date (UTC date at 01:00 is the same day).
      const weekday = new Date(at(day, 1)).getUTCDay();
      const weekend = weekday === 0 || weekday === 6;
      let slot = 0;

      type Spec = {
        category: 'Grooming' | 'Daycare' | 'Hotel' | 'Veterinary';
        service: Service;
        start: number;
        end: number;
        quantity: number;
        assigned: string | null;
        queuePosition?: number;
      };

      const add = (spec: Spec) => {
        slot += 1;
        const n = b * 1_000_000 + day * 1000 + slot;
        const bookingId = uuid('81', n);
        const pet = pick(pets);
        const desk = pick(desks);
        const unit = Number(spec.service.base_price);
        const price = unit * spec.quantity;
        const minutes = Math.round((spec.end - spec.start) / 60_000);

        // Today follows the clock; future days wait.
        let status = 'Pending';
        if (isToday && spec.start <= nowMs) {
          if (spec.category === 'Hotel' || spec.category === 'Daycare') {
            status = 'Late'; // arrival not checked in yet
          } else if (slot % 4 === 0) {
            status = 'Late';
          } else if (spec.end <= nowMs) {
            status = 'Completed';
          } else if (spec.category === 'Grooming') {
            status = 'In Progress';
          }
        }
        const cancelled = !isToday && rand() < 0.04;
        if (cancelled) status = 'Cancelled';

        const r = rand();
        const payment: 'paid' | 'partial' | 'unpaid' | 'none' =
          status === 'Completed'
            ? 'paid'
            : cancelled
              ? 'none'
              : r < 0.5
                ? 'paid'
                : r < 0.8
                  ? 'partial'
                  : 'unpaid';
        const downpayment =
          payment === 'partial' || payment === 'unpaid'
            ? Math.round(price / 2)
            : null;

        const createdAt = Math.min(
          nowMs - HOUR_MS,
          spec.start - between(1, 10) * DAY_MS
        );
        const paidAt = status === 'Completed' ? spec.end : createdAt + HOUR_MS;

        bookings.push({
          id: bookingId,
          customer_id: pet.customer_id,
          pet_id: pet.id,
          branch_id: branch.id,
          created_by_staff_id: desk.id,
          assigned_staff_id: spec.assigned,
          service_category: spec.category,
          booking_source: rand() < 0.3 ? 'Walk-in' : 'Online',
          scheduled_start: iso(spec.start),
          scheduled_end: iso(spec.end),
          status,
          total_price: price,
          discount_amount: 0,
          promo_amount: 0,
          payment_status:
            payment === 'paid'
              ? 'Fully Paid'
              : payment === 'partial'
                ? 'Partially Paid'
                : 'Pending',
          payment_confirmed: payment === 'paid',
          paid_at: payment === 'paid' ? iso(paidAt) : null,
          downpayment_required: downpayment !== null,
          downpayment_amount: downpayment,
          downpayment_due_at:
            downpayment !== null ? iso(spec.start - DAY_MS) : null,
          reschedule_count: 0,
          pay_at_checkout: false,
          created_at: iso(createdAt),
          started_at:
            status === 'In Progress' || status === 'Completed'
              ? iso(spec.start)
              : null,
          completed_at: status === 'Completed' ? iso(spec.end) : null,
          ...(cancelled
            ? {
                cancelled_at: iso(createdAt + HOUR_MS),
                cancellation_reason: 'Owner has a schedule conflict',
              }
            : {}),
        });

        bookingItems.push({
          id: uuid('82', n),
          booking_id: bookingId,
          service_id: spec.service.id,
          price_at_booking: price,
          duration_minutes_at_booking: minutes,
        });

        const charge = (
          k: number,
          choice: 'full' | 'downpayment' | 'balance',
          amount: number,
          paid: boolean,
          when: number
        ) => {
          const txnId = uuid('83', n * 10 + k);
          transactions.push({
            id: txnId,
            booking_id: bookingId,
            customer_id: pet.customer_id,
            branch_id: branch.id,
            transaction_type: 'booking_payment',
            payment_method: rand() < 0.5 ? 'Cash' : 'GCash',
            payment_status: paid ? 'Fully Paid' : 'Pending',
            payment_choice: choice,
            subtotal_amount: amount,
            discount_amount: 0,
            promo_amount: 0,
            credit_applied_amount: 0,
            total_amount: amount,
            processed_by_staff_id: desk.id,
            created_at: iso(when),
          });
          if (choice === 'full') {
            lineItems.push({
              id: uuid('84', n * 10 + k),
              transaction_id: txnId,
              line_item_type: 'service',
              reference_id: spec.service.id,
              description:
                spec.quantity > 1
                  ? `${spec.service.name} x ${spec.quantity}`
                  : spec.service.name,
              quantity: spec.quantity,
              unit_price: unit,
              line_total: price,
            });
          }
        };

        if (payment === 'paid') charge(1, 'full', price, true, paidAt);
        if (downpayment !== null) {
          charge(
            1,
            'downpayment',
            downpayment,
            payment === 'partial',
            createdAt + HOUR_MS
          );
          charge(2, 'balance', price - downpayment, false, createdAt + HOUR_MS);
        }

        if (spec.category === 'Grooming' && spec.assigned && !cancelled) {
          sessions.push({
            id: uuid('85', n),
            booking_id: bookingId,
            assigned_groomer_id: spec.assigned,
            queue_position: spec.queuePosition ?? null,
          });
        }

        if (cancelled) {
          cancellationLogs.push({
            id: uuid('86', n),
            booking_id: bookingId,
            customer_id: pet.customer_id,
            branch_id: branch.id,
            event_type: 'cancellation',
            notice_period_met: true,
            enforcement_mode_applied: 'Strict',
            policy_violation: false,
            credit_issued: false,
            credit_review_status: 'not_applicable',
            created_at: iso(createdAt + HOUR_MS),
          });
          return;
        }

        if (day >= 1 && day <= 2) {
          notifications.push({
            id: uuid('87', n * 10 + 1),
            recipient_customer_id: pet.customer_id,
            event_type: 'appointment_reminder',
            title: 'Upcoming appointment',
            message: `Reminder: ${spec.service.name} on ${iso(spec.start).slice(0, 10)}.`,
            related_booking_id: bookingId,
            is_read: false,
            created_at: iso(Math.min(nowMs - HOUR_MS, spec.start - DAY_MS)),
          });
        }
        if (spec.category === 'Grooming' && spec.assigned && slot % 3 === 1) {
          notifications.push({
            id: uuid('87', n * 10 + 2),
            recipient_staff_id: spec.assigned,
            event_type: 'staff_assigned',
            title: 'New grooming booking assigned',
            message: `${spec.service.name} on ${iso(spec.start).slice(0, 10)}.`,
            related_booking_id: bookingId,
            is_read: day > 7,
            created_at: iso(createdAt),
          });
        }
      };

      // Grooming: groomers round-robin, each working through the day.
      const groomServices = servicesBy('Grooming');
      if (groomServices.length) {
        const count = between(3, 6) + (weekend ? 2 : 0);
        for (let k = 0; k < count; k++) {
          const service = pick(groomServices);
          const groomer = groomers[k % groomers.length];
          const start = at(day, 1 + Math.floor(k / groomers.length) * 1.5);
          add({
            category: 'Grooming',
            service,
            start,
            end: start + (service.duration_minutes ?? 60) * 60_000,
            quantity: 1,
            assigned: groomer.id,
            queuePosition: isToday ? k + 1 : undefined,
          });
        }
      }

      // Daycare drop-offs.
      const daycare = servicesBy('Daycare');
      if (daycare.length) {
        const count = between(1, 3);
        for (let k = 0; k < count; k++) {
          const service = pick(daycare);
          const hours = between(4, 8);
          const start = at(day, 1 + k * 0.5);
          // Per-hour services are charged by the hour; flat ones once.
          const perHour = /hour/i.test(service.name);
          add({
            category: 'Daycare',
            service,
            start,
            end: start + hours * HOUR_MS,
            quantity: perHour ? hours : 1,
            assigned: null,
          });
        }
      }

      // Hotel check-ins.
      const hotel = servicesBy('Hotel');
      if (hotel.length) {
        const count = between(0, 2);
        for (let k = 0; k < count; k++) {
          const nights = between(1, 4);
          const start = at(day, 2 + k);
          add({
            category: 'Hotel',
            service: pick(hotel),
            start,
            end: start + nights * DAY_MS,
            quantity: nights,
            assigned: null,
          });
        }
      }

      // Veterinary appointments, vet branches only.
      const vetServices = servicesBy('Veterinary');
      if (branch.is_vet_branch && vetServices.length) {
        const count = between(1, 3);
        for (let k = 0; k < count; k++) {
          const service = pick(vetServices);
          const start = at(day, 2 + k * 2);
          add({
            category: 'Veterinary',
            service,
            start,
            end: start + (service.duration_minutes ?? 60) * 60_000,
            quantity: 1,
            assigned: pick(vets).id,
          });
        }
      }
    }
  });

  // ── Staff attendance: last ATTENDANCE_DAYS days + today, Mon-Sat ──
  const markerFor = (branchId: string) =>
    staff.find(
      (s) =>
        s.branch_id === branchId &&
        (s.role === 'Supervisor' || s.role === 'Admin')
    ) ?? staff.find((s) => s.role === 'Superadmin');

  for (const person of staff) {
    if (!person.branch_id) continue;
    const marker = markerFor(person.branch_id);
    for (let back = ATTENDANCE_DAYS; back >= 0; back--) {
      const dayStart = at(-back, 0);
      if (new Date(dayStart).getUTCDay() === 0) continue; // Sunday off
      const r = rand();
      attendance.push({
        staff_id: person.id,
        branch_id: person.branch_id,
        attendance_date: iso(dayStart).slice(0, 10),
        status: r < 0.04 ? 'Absent' : r < 0.12 ? 'Late' : 'Present',
        marked_by: marker?.id ?? null,
        created_at: iso(dayStart + HOUR_MS),
      });
    }
  }

  // ── Bug reports / feature requests over the last 90 days ──
  const reviewer =
    staff.find((s) => s.role === 'Developer') ??
    staff.find((s) => s.role === 'Superadmin');
  const reviewedStatuses = ['in_progress', 'resolved', 'dismissed'];
  BUG_REPORTS.forEach((report, i) => {
    const createdAt = nowMs - (90 - i * 7) * DAY_MS;
    // Newest few still wait for review; older ones have been triaged.
    const reviewed = !!reviewer && i < BUG_REPORTS.length - 3;
    const fromCustomer = i % 2 === 0 && customers.length > 0;
    bugReports.push({
      id: uuid('b6', i + 1),
      reporter_customer_id: fromCustomer
        ? customers[i % customers.length]
        : null,
      reporter_staff_id: fromCustomer ? null : staff[i % staff.length].id,
      category: report.category,
      title: report.title,
      description: report.description,
      status: reviewed
        ? reviewedStatuses[i % reviewedStatuses.length]
        : 'pending',
      reviewed_by: reviewed ? reviewer!.id : null,
      reviewed_at: reviewed ? iso(createdAt + 2 * DAY_MS) : null,
      created_at: iso(createdAt),
    });
    if (reviewer) {
      notifications.push({
        id: uuid('87', 9_000_000 + i),
        recipient_staff_id: reviewer.id,
        event_type: 'bug_report_submitted',
        title:
          report.category === 'bug' ? 'New bug report' : 'New feature request',
        message: report.title,
        is_read: reviewed,
        created_at: iso(createdAt),
      });
    }
  });

  // Parents before children.
  const writes: Array<[string, Row[]]> = [
    ['bookings', bookings],
    ['booking_items', bookingItems],
    ['grooming_sessions', sessions],
    ['transactions', transactions],
    ['transaction_line_items', lineItems],
    ['cancellation_logs', cancellationLogs],
    ['bug_reports', bugReports],
    ['notifications', notifications],
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

  if (attendance.length) {
    check(
      'staff_attendance',
      await supabase.from('staff_attendance').upsert(attendance, {
        onConflict: 'staff_id,attendance_date',
        ignoreDuplicates: true,
      })
    );
  }
}
