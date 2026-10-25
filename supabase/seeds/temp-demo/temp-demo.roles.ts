import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Demo rows for the Groomer and Front Desk consoles, per branch, dated
 * relative to the day the seed runs so the "today" queues aren't empty:
 *
 * - Groomer: grooming bookings assigned to each groomer (in progress, paid
 *   and waiting, part-paid, tomorrow, completed, no-show) + grooming_sessions,
 *   and days-off requests (one approved, one pending).
 * - Groomer + Front Desk (shared hotel/daycare pages): active hotel stays
 *   with feeding/walking/playing/medication instructions, care log entries
 *   and activity log rows; a hotel arrival waiting for check-in; a finished
 *   stay; an active and an upcoming daycare session. Cages used by active
 *   stays are marked Occupied so Cage Occupancy matches.
 * - Front Desk: an unpaid downpayment booking, cancellations waiting in the
 *   Credit Review Queue, an approved credit-to-balance cancellation, misc
 *   sales (one paid with that credit), and days-off requests.
 *
 * Fixed ids + upsert(ignoreDuplicates) keep re-runs from adding duplicates;
 * a re-run on a later day leaves the first run's dates as they were.
 */

const uuid = (kind: string, n: number) =>
  `6d000000-0000-4000-8000-${kind}${String(n).padStart(10, '0')}`;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function check<T extends { error: { message: string } | null }>(
  label: string,
  result: T
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

type Row = Record<string, unknown>;
type Pet = { id: string; customer_id: string; weight_class: string | null };
type Cage = { id: string; branch_id: string; size: string; status: string };
type Staff = { id: string; role: string; branch_id: string };
type Service = {
  id: string;
  name: string;
  category: string;
  base_price: number;
  duration_minutes: number | null;
};

export async function seedTempRoleDemo(
  supabase: SupabaseClient,
  now = new Date()
) {
  const [
    branchRes,
    staffRes,
    petRes,
    cageRes,
    servicesRes,
    productRes,
    activeStayRes,
  ] = await Promise.all([
    supabase.from('branches').select('id').order('created_at'),
    supabase
      .from('staff_profiles')
      .select('id, role, branch_id')
      .eq('is_active', true)
      .order('created_at'),
    supabase
      .from('pets')
      .select('id, customer_id, weight_class')
      .order('created_at')
      .limit(200),
    supabase
      .from('cages')
      .select('id, branch_id, size, status')
      .is('archived_at', null)
      .order('cage_label'),
    supabase
      .from('services')
      .select('id, name, category, base_price, duration_minutes')
      .is('archived_at', null)
      .eq('is_active', true),
    supabase
      .from('product_catalog')
      .select('id, name, price')
      .is('archived_at', null)
      .is('owner_customer_id', null)
      .eq('is_active', true)
      .limit(10),
    supabase.from('stays').select('id, pet_id, cage_id').eq('status', 'Active'),
  ]);

  for (const r of [
    branchRes,
    staffRes,
    petRes,
    cageRes,
    servicesRes,
    productRes,
    activeStayRes,
  ]) {
    if (r.error) throw r.error;
  }

  const branches = (branchRes.data ?? []).map((b) => b.id as string);
  const staff = (staffRes.data ?? []) as Staff[];
  const pets = ((petRes.data ?? []) as Pet[]).filter((p) => p.customer_id);
  const cages = (cageRes.data ?? []) as Cage[];
  const services = (servicesRes.data ?? []) as Service[];
  const products = (productRes.data ?? []) as Array<{
    id: string;
    name: string;
    price: number;
  }>;

  if (!branches.length || !staff.length || !pets.length) {
    throw new Error('Base data missing for Groomer/Front Desk demo rows');
  }

  const byName = (category: string, name: string) =>
    services.find((s) => s.category === category && s.name === name) ??
    services.find((s) => s.category === category);
  const groomServices = [
    byName('Grooming', 'Bath'),
    byName('Grooming', 'Nail Trim'),
  ].filter((s, i, list): s is Service => !!s && list.indexOf(s) === i);
  const hotelService = byName('Hotel', 'Overnight Stay (Aircon Room)');
  const daycareService = byName('Daycare', 'Daycare (per hour)');
  if (!groomServices.length || !hotelService || !daycareService) {
    throw new Error('No active Grooming/Hotel/Daycare service to book');
  }

  // Our own stays from an earlier run keep their cage, so a re-run never
  // claims (and marks Occupied) a second cage for the same stay.
  const activeStays = (activeStayRes.data ?? []) as Array<{
    id: string;
    pet_id: string;
    cage_id: string;
  }>;
  const ourStayCage = new Map(
    activeStays
      .filter((s) => s.id.startsWith('6d000000-0000-4000-8000-d'))
      .map((s) => [s.id, s.cage_id])
  );
  const busyPets = new Set(
    activeStays.filter((s) => !ourStayCage.has(s.id)).map((s) => s.pet_id)
  );
  const freePets = pets.filter((p) => !busyPets.has(p.id));

  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  // Hours are UTC; +8 for Manila (01:00 UTC = 9:00 AM).
  const at = (dayOffset: number, hourUtc: number) =>
    new Date(today + dayOffset * DAY_MS + hourUtc * HOUR_MS).toISOString();
  const dateOf = (dayOffset: number) => at(dayOffset, 0).slice(0, 10);

  const bookings: Row[] = [];
  const bookingItems: Row[] = [];
  const sessions: Row[] = [];
  const transactions: Row[] = [];
  const lineItems: Row[] = [];
  const stays: Row[] = [];
  const feeding: Row[] = [];
  const walking: Row[] = [];
  const playing: Row[] = [];
  const medication: Row[] = [];
  const careLogs: Row[] = [];
  const activity: Row[] = [];
  const cancellationLogs: Row[] = [];
  const unavailability: Row[] = [];
  const creditTxns: Row[] = [];
  const occupiedCages = new Set<string>();
  const creditTargets: Array<{
    customerId: string;
    branchId: string;
    issuance: Row;
    redemption: Row;
  }> = [];

  let petSeq = 0;
  const nextPet = (pool: Pet[] = pets) => pool[petSeq++ % pool.length];

  branches.forEach((branchId, b) => {
    const inBranch = (role: string) =>
      staff.filter((s) => s.branch_id === branchId && s.role === role);
    const groomers = inBranch('Groomer');
    const frontDesk = inBranch('Front Desk');
    const approver =
      inBranch('Supervisor')[0] ??
      inBranch('Admin')[0] ??
      staff.find((s) => s.role === 'Superadmin');
    const desk = frontDesk[0] ?? approver ?? staff[0];
    const careStaff = inBranch('Pet Assistant')[0] ?? groomers[0] ?? desk;

    // Each branch gets its own id block: n = branch * 1_000_000 + slot.
    const id = (kind: string, n: number) => uuid(kind, b * 1_000_000 + n);
    let slot = 0;

    type BookingSpec = {
      category: 'Grooming' | 'Hotel' | 'Daycare';
      pet: Pet;
      start: string;
      end: string;
      status: string;
      price: number;
      items: Array<{ service: Service; price: number; minutes: number }>;
      assigned?: string;
      source?: 'Online' | 'Walk-in';
      payment: 'paid' | 'partial' | 'unpaid' | 'none';
      extra?: Row;
    };

    const addBooking = (spec: BookingSpec) => {
      slot += 1;
      const bookingId = id('d1', slot);
      const downpayment =
        spec.payment === 'partial' || spec.payment === 'unpaid'
          ? Math.round(spec.price / 2)
          : null;
      const paymentStatus =
        spec.payment === 'paid'
          ? 'Fully Paid'
          : spec.payment === 'partial'
            ? 'Partially Paid'
            : 'Pending';

      bookings.push({
        id: bookingId,
        customer_id: spec.pet.customer_id,
        pet_id: spec.pet.id,
        branch_id: branchId,
        created_by_staff_id: desk.id,
        assigned_staff_id: spec.assigned ?? null,
        service_category: spec.category,
        booking_source: spec.source ?? 'Online',
        scheduled_start: spec.start,
        scheduled_end: spec.end,
        status: spec.status,
        total_price: spec.price,
        discount_amount: 0,
        promo_amount: 0,
        payment_status: paymentStatus,
        payment_confirmed: spec.payment === 'paid',
        paid_at: spec.payment === 'paid' ? spec.start : null,
        downpayment_required: downpayment !== null,
        downpayment_amount: downpayment,
        downpayment_due_at:
          downpayment !== null
            ? new Date(Date.parse(spec.start) - DAY_MS).toISOString()
            : null,
        reschedule_count: 0,
        pay_at_checkout: false,
        created_at: new Date(Date.parse(spec.start) - 2 * DAY_MS).toISOString(),
        ...spec.extra,
      });

      spec.items.forEach((item, i) => {
        bookingItems.push({
          id: id('d2', slot * 10 + i),
          booking_id: bookingId,
          service_id: item.service.id,
          price_at_booking: item.price,
          duration_minutes_at_booking: item.minutes,
        });
      });

      const charge = (
        n: number,
        choice: 'full' | 'downpayment' | 'balance',
        amount: number,
        paid: boolean
      ) => {
        const txnId = id('d3', slot * 10 + n);
        transactions.push({
          id: txnId,
          booking_id: bookingId,
          customer_id: spec.pet.customer_id,
          branch_id: branchId,
          transaction_type: 'booking_payment',
          payment_method: n % 2 === 0 ? 'Cash' : 'GCash',
          payment_status: paid ? 'Fully Paid' : 'Pending',
          payment_choice: choice,
          subtotal_amount: amount,
          discount_amount: 0,
          promo_amount: 0,
          credit_applied_amount: 0,
          total_amount: amount,
          processed_by_staff_id: desk.id,
          created_at: new Date(
            Date.parse(spec.start) - (choice === 'balance' ? 0 : DAY_MS)
          ).toISOString(),
        });
        if (choice === 'full') {
          spec.items.forEach((item, i) => {
            lineItems.push({
              id: id('d4', slot * 100 + n * 10 + i),
              transaction_id: txnId,
              line_item_type: 'service',
              reference_id: item.service.id,
              description: item.service.name,
              quantity: 1,
              unit_price: item.price,
              line_total: item.price,
            });
          });
        }
        return txnId;
      };

      if (spec.payment === 'paid') charge(1, 'full', spec.price, true);
      if (spec.payment === 'partial' || spec.payment === 'unpaid') {
        const paid = spec.payment === 'partial';
        charge(1, 'downpayment', downpayment!, paid);
        charge(2, 'balance', spec.price - downpayment!, false);
      }

      return { bookingId, slot, downpayment };
    };

    const groomItems = groomServices.map((service) => ({
      service,
      price: Number(service.base_price),
      minutes: service.duration_minutes ?? 30,
    }));
    const groomPrice = groomItems.reduce((sum, item) => sum + item.price, 0);
    const groomMinutes = groomItems.reduce((sum, i) => sum + i.minutes, 0);
    const groomEnd = (start: string) =>
      new Date(Date.parse(start) + groomMinutes * 60_000).toISOString();

    // ── Groomer: one day's queue + history per groomer ──
    groomers.forEach((groomer, g) => {
      const plan: Array<{
        day: number;
        hour: number;
        status: string;
        payment: BookingSpec['payment'];
        source?: 'Online' | 'Walk-in';
      }> = [
        {
          day: 0,
          hour: 1,
          status: 'In Progress',
          payment: 'paid',
          source: 'Walk-in',
        },
        { day: 0, hour: 3, status: 'Pending', payment: 'paid' },
        { day: 0, hour: 6, status: 'Pending', payment: 'partial' },
        { day: 1, hour: 2, status: 'Pending', payment: 'paid' },
        { day: -1, hour: 2, status: 'Completed', payment: 'paid' },
        { day: -2, hour: 3, status: 'No-show', payment: 'none' },
      ];

      plan.forEach((p, q) => {
        const start = at(p.day, p.hour + g * 0.5);
        const end = groomEnd(start);
        const { bookingId, slot: s } = addBooking({
          category: 'Grooming',
          pet: nextPet(),
          start,
          end,
          status: p.status,
          price: groomPrice,
          items: groomItems,
          assigned: groomer.id,
          source: p.source,
          payment: p.payment,
          extra: {
            started_at:
              p.status === 'In Progress' || p.status === 'Completed'
                ? start
                : null,
            completed_at: p.status === 'Completed' ? end : null,
          },
        });
        if (p.status !== 'No-show') {
          sessions.push({
            id: id('d5', s),
            booking_id: bookingId,
            assigned_groomer_id: groomer.id,
            queue_position: p.day === 0 ? q + 1 : null,
          });
        }
      });
    });

    // ── Hotel / Daycare (shared by Groomer, Front Desk, Pet Assistant) ──
    const branchCages = cages.filter((c) => c.branch_id === branchId);
    const takeCage = (stayId: string, pet: Pet) => {
      const kept = ourStayCage.get(stayId);
      if (kept) return kept;
      const free = branchCages.filter(
        (c) => c.status === 'Available' && !occupiedCages.has(c.id)
      );
      const cage = free.find((c) => c.size === pet.weight_class) ?? free[0];
      return cage?.id;
    };

    const hotelPrice = Number(hotelService.base_price);
    const hotelStay = (
      k: number,
      dayIn: number,
      nights: number,
      status: 'In Progress' | 'Completed',
      payment: BookingSpec['payment'],
      withMeds: boolean
    ) => {
      const pet = nextPet(freePets);
      const start = at(dayIn, 2);
      const end = at(dayIn + nights, 2);
      const stayId = id('d6', k);
      // A finished stay doesn't hold its cage, so any branch cage will do.
      const cageId =
        status === 'Completed' ? branchCages[0]?.id : takeCage(stayId, pet);
      if (!cageId) {
        // Keep later slots (and so their ids) the same on every run.
        slot += 1;
        return;
      }
      const price = hotelPrice * nights;
      const { bookingId } = addBooking({
        category: 'Hotel',
        pet,
        start,
        end,
        status,
        price,
        items: [{ service: hotelService, price, minutes: 1440 * nights }],
        payment,
        extra: {
          started_at: start,
          completed_at: status === 'Completed' ? end : null,
        },
      });
      const active = status === 'In Progress';
      if (active) occupiedCages.add(cageId);

      stays.push({
        id: stayId,
        booking_id: bookingId,
        pet_id: pet.id,
        cage_id: cageId,
        branch_id: branchId,
        stay_type: 'Hotel',
        status: active ? 'Active' : 'Completed',
        check_in_at: start,
        scheduled_check_out_date: end.slice(0, 10),
        actual_check_out_at: active ? null : end,
        downpayment_amount: 0,
        notify_opt_in: true,
        created_by_staff_id: desk.id,
        service_id: hotelService.id,
      });

      const meals = [
        {
          meal_time: 'Morning',
          food_type: 'Dry kibble',
          quantity: '1',
          quantity_unit: 'cup',
        },
        {
          meal_time: 'Evening',
          food_type: 'Wet food',
          quantity: '1',
          quantity_unit: 'can',
        },
      ];
      meals.forEach((meal, i) =>
        feeding.push({
          id: id('d7', k * 10 + i),
          stay_id: stayId,
          ...meal,
          special_instructions: i === 0 ? 'Mix with warm water' : null,
        })
      );
      walking.push({
        id: id('d8', k),
        stay_id: stayId,
        time_block: 'Morning',
        duration_minutes: 15,
        notes: 'Leash only - pulls a little',
      });
      playing.push({
        id: id('d9', k),
        stay_id: stayId,
        time_block: 'Afternoon',
        duration_minutes: 20,
        notes: 'Likes fetch',
      });
      if (withMeds) {
        medication.push({
          id: id('da', k),
          stay_id: stayId,
          medication_name: 'Amoxicillin',
          dose: '250',
          dose_unit: 'mg',
          scheduled_times: ['08:00', '20:00'],
          administration_notes: 'Give with food',
        });
      }

      activity.push({
        id: id('db', k * 10),
        branch_id: branchId,
        stay_id: stayId,
        action: 'check_in',
        actor_staff_id: desk.id,
        description: 'Checked in for a Hotel stay',
        created_at: start,
      });
      if (!active) {
        activity.push({
          id: id('db', k * 10 + 1),
          branch_id: branchId,
          stay_id: stayId,
          action: 'check_out',
          actor_staff_id: desk.id,
          description: 'Checked out of a Hotel stay',
          created_at: end,
        });
      }

      // Care log: one row per task per night, same descriptions
      // generateCareLogEntries writes. Past days are done (one missed);
      // today's morning tasks are done, the rest still pending.
      const tasks: Array<{
        care_type: string;
        time_block: string;
        description: string;
      }> = [
        ...meals.map((m) => ({
          care_type: 'Feeding',
          time_block: m.meal_time,
          description: `${m.meal_time} meal — ${m.quantity} ${m.quantity_unit} ${m.food_type}`,
        })),
        {
          care_type: 'Walking',
          time_block: 'Morning',
          description: 'Morning walk — 15 min',
        },
        {
          care_type: 'Playing',
          time_block: 'Afternoon',
          description: 'Afternoon playtime — 20 min',
        },
        ...(withMeds
          ? [
              {
                care_type: 'Medication',
                time_block: 'Morning',
                description: 'Amoxicillin 250 mg — 08:00',
              },
              {
                care_type: 'Medication',
                time_block: 'Evening',
                description: 'Amoxicillin 250 mg — 20:00',
              },
            ]
          : []),
      ];
      for (let d = 0; d <= nights; d++) {
        const dayOffset = dayIn + d;
        tasks.forEach((task, t) => {
          const entryId = id('dc', k * 1000 + d * 10 + t);
          const past = dayOffset < 0 || !active;
          const missed = past && active && t === tasks.length - 1;
          const doneToday = dayOffset === 0 && task.time_block === 'Morning';
          const done = (past && !missed) || doneToday;
          const doneAt = at(dayOffset, task.time_block === 'Morning' ? 1 : 9);
          careLogs.push({
            id: entryId,
            stay_id: stayId,
            care_type: task.care_type,
            scheduled_date: dateOf(dayOffset),
            description: task.description,
            time_block: task.time_block,
            status: done ? 'Completed' : missed ? 'Missed' : 'Pending',
            completed_at: done ? doneAt : null,
            completed_by: done ? careStaff.id : null,
          });
          if (done || missed) {
            activity.push({
              id: id('dd', k * 1000 + d * 10 + t),
              branch_id: branchId,
              stay_id: stayId,
              care_log_entry_id: entryId,
              action: done ? 'task_completed' : 'task_missed',
              actor_staff_id: done ? careStaff.id : null,
              description: `${task.description} ${done ? 'completed' : 'missed'}`,
              created_at: doneAt,
            });
          }
        });
      }
    };

    hotelStay(1, -1, 3, 'In Progress', 'paid', true);
    hotelStay(2, 0, 1, 'In Progress', 'partial', false);
    hotelStay(3, -3, 2, 'Completed', 'paid', false);

    // Arriving today, paid - waits in the Hotel Queue's check-in list.
    addBooking({
      category: 'Hotel',
      pet: nextPet(freePets),
      start: at(0, 4),
      end: at(2, 4),
      status: 'Pending',
      price: hotelPrice * 2,
      items: [{ service: hotelService, price: hotelPrice * 2, minutes: 2880 }],
      payment: 'paid',
    });

    // Daycare: one checked in this morning, one still to arrive.
    const daycareRate = Number(daycareService.base_price);
    const daycarePet = nextPet(freePets);
    const daycareStayId = id('d6', 900);
    const daycareCage = takeCage(daycareStayId, daycarePet);
    if (daycareCage) {
      const start = at(0, 1);
      const { bookingId } = addBooking({
        category: 'Daycare',
        pet: daycarePet,
        start,
        end: at(0, 9),
        status: 'In Progress',
        price: daycareRate * 8,
        items: [
          { service: daycareService, price: daycareRate * 8, minutes: 480 },
        ],
        source: 'Walk-in',
        payment: 'paid',
        extra: { started_at: start },
      });
      occupiedCages.add(daycareCage);
      stays.push({
        id: daycareStayId,
        booking_id: bookingId,
        pet_id: daycarePet.id,
        cage_id: daycareCage,
        branch_id: branchId,
        stay_type: 'Daycare',
        status: 'Active',
        check_in_at: start,
        scheduled_check_out_date: dateOf(0),
        downpayment_amount: 0,
        notify_opt_in: false,
        created_by_staff_id: desk.id,
        service_id: daycareService.id,
      });
      activity.push({
        id: id('db', 9000),
        branch_id: branchId,
        stay_id: daycareStayId,
        action: 'check_in',
        actor_staff_id: desk.id,
        description: 'Checked in for a Daycare session',
        created_at: start,
      });
    } else {
      slot += 1;
    }
    addBooking({
      category: 'Daycare',
      pet: nextPet(freePets),
      start: at(0, 2),
      end: at(0, 8),
      status: 'Pending',
      price: daycareRate * 6,
      items: [
        { service: daycareService, price: daycareRate * 6, minutes: 360 },
      ],
      payment: 'paid',
    });

    // ── Front Desk: payments, cancellations, credit, misc sales ──
    const firstGroomer = groomers[0]?.id;

    // Online booking with its downpayment still unpaid.
    addBooking({
      category: 'Grooming',
      pet: nextPet(),
      start: at(2, 2),
      end: groomEnd(at(2, 2)),
      status: 'Pending',
      price: groomPrice,
      items: groomItems,
      assigned: firstGroomer,
      payment: 'unpaid',
    });

    // Cancelled after paying a downpayment: two wait for credit review,
    // one was approved and turned into branch credit.
    const cancelled = [0, 1, 2].map((c) => {
      const pet = nextPet();
      const { bookingId, downpayment } = addBooking({
        category: 'Grooming',
        pet,
        start: at(3 + c, 2),
        end: groomEnd(at(3 + c, 2)),
        status: 'Cancelled',
        price: groomPrice,
        items: groomItems,
        assigned: firstGroomer,
        payment: 'partial',
        extra: {
          cancelled_at: at(-1, 3 + c),
          cancellation_reason: 'Owner has a schedule conflict',
        },
      });
      const approved = c === 2;
      const logId = id('de', c + 1);
      cancellationLogs.push({
        id: logId,
        booking_id: bookingId,
        customer_id: pet.customer_id,
        branch_id: branchId,
        event_type: 'cancellation',
        notice_period_met: true,
        enforcement_mode_applied: 'Strict',
        policy_violation: false,
        credit_issued: approved,
        credit_amount: approved ? downpayment : null,
        credit_review_status: approved ? 'approved' : 'pending',
        reviewed_by: approved ? desk.id : null,
        reviewed_at: approved ? at(-1, 5) : null,
        notes: approved ? 'Downpayment returned as credit' : null,
        created_at: at(-1, 3 + c),
      });
      return { pet, logId, downpayment: downpayment!, approved };
    });

    // Misc sales: a cash sale, and one paid with the approved credit.
    const product = products[b % Math.max(products.length, 1)];
    const credited = cancelled.find((c) => c.approved)!;
    const sales = [
      { pet: nextPet(), method: 'Cash', qty: 2, day: 0 },
      { pet: credited.pet, method: 'Credit', qty: 1, day: 0 },
    ];
    sales.forEach((sale, i) => {
      const unit = product ? Number(product.price) : 250;
      const total = unit * sale.qty;
      const txnId = id('df', i + 1);
      const useCredit = sale.method === 'Credit';
      const creditUsed = useCredit ? Math.min(total, credited.downpayment) : 0;
      transactions.push({
        id: txnId,
        booking_id: null,
        customer_id: sale.pet.customer_id,
        branch_id: branchId,
        transaction_type: 'miscellaneous_sale',
        payment_method: sale.method,
        payment_status: 'Fully Paid',
        subtotal_amount: total,
        discount_amount: 0,
        promo_amount: 0,
        credit_applied_amount: creditUsed,
        total_amount: total,
        misc_sale_description: `${product?.name ?? 'Pet shampoo'} x${sale.qty}`,
        processed_by_staff_id: desk.id,
        created_at: at(sale.day, 2 + i),
      });
      lineItems.push({
        id: id('d4', 9000 + i),
        transaction_id: txnId,
        line_item_type: 'misc_sale_item',
        reference_id: product?.id ?? null,
        description: product?.name ?? 'Pet shampoo',
        quantity: sale.qty,
        unit_price: unit,
        line_total: total,
      });
      if (useCredit) {
        creditTargets.push({
          customerId: credited.pet.customer_id,
          branchId,
          issuance: {
            id: id('d0', 1),
            transaction_type: 'issuance',
            amount: credited.downpayment,
            cancellation_log_id: credited.logId,
            expires_at: at(29, 5),
            created_at: at(-1, 5),
          },
          redemption: {
            id: id('d0', 2),
            transaction_type: 'redemption',
            amount: creditUsed,
            transaction_id: txnId,
            created_at: at(sale.day, 2 + i),
          },
        });
      }
    });

    // ── Days off (Groomer + Front Desk): approved rest day + pending leave ──
    [...groomers, ...frontDesk].forEach((person, p) => {
      const restStart = at(4 + (p % 3), -8); // 00:00 Manila
      unavailability.push({
        id: id('c9', p * 10 + 1),
        staff_id: person.id,
        start_time: restStart,
        end_time: new Date(Date.parse(restStart) + DAY_MS).toISOString(),
        reason: 'Weekly rest day',
        created_by: approver?.id ?? desk.id,
        status: 'approved',
        is_full_day: true,
        leave_type: 'Rest Day',
        reviewed_by: approver?.id ?? null,
        reviewed_at: approver ? at(-2, 2) : null,
      });
      const leaveStart = at(10 + p, -8);
      unavailability.push({
        id: id('c9', p * 10 + 2),
        staff_id: person.id,
        start_time: leaveStart,
        end_time: new Date(Date.parse(leaveStart) + 2 * DAY_MS).toISOString(),
        reason: p % 2 === 0 ? 'Family trip' : 'Medical check-up',
        created_by: person.id, // self-requested -> trigger keeps it pending
        status: 'pending',
        is_full_day: true,
        leave_type: p % 2 === 0 ? 'Vacation Leave' : 'Sick Leave',
        requested_reviewer_id: approver?.id ?? null,
      });
    });
  });

  // Credit: reuse the customer's balance row for that branch when one
  // exists (one per customer/branch), then keep `balance` equal to its
  // ledger so Credit Management never shows a mismatched total.
  const balanceIds: string[] = [];
  for (const target of creditTargets) {
    const existing = check(
      'credit_balances',
      await supabase
        .from('credit_balances')
        .select('id')
        .eq('customer_id', target.customerId)
        .eq('branch_id', target.branchId)
        .maybeSingle()
    );
    let balanceId = (existing.data as { id: string } | null)?.id;
    if (!balanceId) {
      const inserted = check(
        'credit_balances',
        await supabase
          .from('credit_balances')
          .insert({
            customer_id: target.customerId,
            branch_id: target.branchId,
            balance: 0,
          })
          .select('id')
          .single()
      );
      balanceId = (inserted.data as { id: string }).id;
    }
    balanceIds.push(balanceId);
    creditTxns.push(
      { ...target.issuance, credit_balance_id: balanceId },
      { ...target.redemption, credit_balance_id: balanceId }
    );
  }

  const writes: Array<[string, Row[]]> = [
    ['bookings', bookings],
    ['booking_items', bookingItems],
    ['grooming_sessions', sessions],
    ['transactions', transactions],
    ['transaction_line_items', lineItems],
    ['stays', stays],
    ['care_feeding_instructions', feeding],
    ['care_walking_instructions', walking],
    ['care_playing_instructions', playing],
    ['care_medication_instructions', medication],
    ['care_log_entries', careLogs],
    ['activity_log', activity],
    ['cancellation_logs', cancellationLogs],
    ['credit_transactions', creditTxns],
    ['staff_unavailability_blocks', unavailability],
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

  if (occupiedCages.size) {
    check(
      'cages',
      await supabase
        .from('cages')
        .update({ status: 'Occupied' })
        .in('id', [...occupiedCages])
    );
  }

  for (const balanceId of balanceIds) {
    const ledger = check(
      'credit_transactions',
      await supabase
        .from('credit_transactions')
        .select('transaction_type, amount')
        .eq('credit_balance_id', balanceId)
    );
    const balance = (
      (ledger.data ?? []) as Array<{ transaction_type: string; amount: number }>
    ).reduce(
      (sum, row) =>
        sum +
        (row.transaction_type === 'issuance' ? 1 : -1) * Number(row.amount),
      0
    );
    check(
      'credit_balances',
      await supabase
        .from('credit_balances')
        .update({ balance: Math.max(balance, 0) })
        .eq('id', balanceId)
    );
  }
}
