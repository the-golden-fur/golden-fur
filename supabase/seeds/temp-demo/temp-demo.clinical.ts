import type { SupabaseClient } from '@supabase/supabase-js';

const N = 15;

const uuid = (kind: string, n: number) =>
  `6d000000-0000-4000-8000-${kind}${String(n).padStart(10, '0')}`;

const pick = <T>(list: T[], n: number): T => list[n % list.length];

function check<T extends { error: { message: string } | null }>(
  label: string,
  result: T
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

export async function seedTempClinical(supabase: SupabaseClient) {
  const groomIds = Array.from({ length: N }, (_, i) => uuid('a1', i + 1));
  const bookingIds = Array.from({ length: N }, (_, i) => uuid('a1', i + 1));
  const txnIds = Array.from({ length: N }, (_, i) => uuid('a3', i + 1));
  const stayIds = Array.from({ length: N }, (_, i) => uuid('a5', 17 + i));

  const [
    petRes,
    customerRes,
    branchRes,
    staffRes,
    cageRes,
    servicesRes,
    promoRes,
    bookingRes,
    txnRes,
    stayRes,
  ] = await Promise.all([
    supabase
      .from('pets')
      .select('id, customer_id')
      .order('created_at')
      .limit(200),
    supabase
      .from('customer_profiles')
      .select('id')
      .order('created_at')
      .limit(20),
    supabase.from('branches').select('id').order('created_at').limit(2),
    supabase
      .from('staff_profiles')
      .select('id, role, branch_id')
      .order('created_at')
      .limit(50),
    supabase.from('cages').select('id').is('archived_at', null).limit(50),
    supabase
      .from('services')
      .select('id, category, base_price, duration_minutes')
      .is('archived_at', null)
      .eq('is_active', true),
    supabase.from('promos').select('id').limit(5),
    supabase
      .from('bookings')
      .select('id, customer_id, pet_id, branch_id')
      .in('id', [...new Set([...groomIds, ...bookingIds])]),
    supabase.from('transactions').select('id').in('id', txnIds),
    supabase
      .from('stays')
      .select('id, pet_id, branch_id, stay_type')
      .in('id', stayIds),
  ]);

  for (const r of [
    petRes,
    customerRes,
    branchRes,
    staffRes,
    cageRes,
    servicesRes,
    promoRes,
    bookingRes,
    txnRes,
    stayRes,
  ]) {
    if (r.error) throw r.error;
  }

  const customers = (customerRes.data ?? []).map((c) => c.id as string);
  const branches = (branchRes.data ?? []).map((b) => b.id as string);
  const staff = staffRes.data ?? [];
  const vets = staff.filter((s) => s.role === 'Veterinarian');
  const vet = vets[0] ?? staff[0];
  const services = servicesRes.data ?? [];
  const promos = (promoRes.data ?? []).map((p) => p.id as string);
  const bookings = bookingRes.data ?? [];
  const txns = txnIds;
  const stays = stayRes.data ?? [];

  if (!customers.length || !branches.length || !staff.length || !vet) {
    throw new Error('Base data missing for clinical demo rows');
  }

  const staffIds = staff.map((s) => s.id as string);

  // Extra pets so pet_health_conditions (one row per pet) can reach 15.
  const pets = (petRes.data ?? []).filter((p) => p.customer_id);
  const extraPets = Array.from({ length: 2 }, (_, i) => ({
    id: uuid('e1', i + 1),
    customer_id: pick(customers, i),
    name: `Demo Pet ${i + 1}`,
    pet_type: 'Dog',
    weight_class: 'S',
    coat_type: 'SC',
    is_active: true,
  }));
  const allPets = [
    ...pets,
    ...extraPets.map((p) => ({ id: p.id, customer_id: p.customer_id })),
  ];

  const vetService = services.find((s) => s.category === 'Veterinary');
  if (!vetService) throw new Error('No active Veterinary service to book');

  // 15 completed veterinary bookings for consultations.
  const vetBookings = Array.from({ length: N }, (_, i) => {
    const pet = pick(allPets, i);
    const start = new Date(Date.UTC(2026, 8, 1 + i, 1, 0, 0));
    return {
      id: uuid('e2', i + 1),
      customer_id: pet.customer_id,
      pet_id: pet.id,
      branch_id: pick(branches, 0),
      created_by_staff_id: vet.id,
      service_category: 'Veterinary',
      booking_source: 'Walk-in',
      scheduled_start: start.toISOString(),
      scheduled_end: new Date(start.getTime() + 60 * 60_000).toISOString(),
      status: 'Completed',
      total_price: Number(vetService.base_price),
      discount_amount: 0,
      promo_amount: 0,
      payment_status: 'Fully Paid',
      payment_confirmed: true,
      paid_at: start.toISOString(),
      reschedule_count: 0,
      downpayment_required: false,
      pay_at_checkout: false,
    };
  });
  const vetBookingItems = vetBookings.map((b, i) => ({
    id: uuid('e3', i + 1),
    booking_id: b.id,
    service_id: vetService.id,
    price_at_booking: Number(vetService.base_price),
    duration_minutes_at_booking: 60,
  }));
  const vetTxns = vetBookings.map((b, i) => ({
    id: uuid('e4', i + 1),
    booking_id: b.id,
    customer_id: b.customer_id,
    branch_id: b.branch_id,
    transaction_type: 'booking_payment',
    payment_method: 'Cash',
    payment_status: 'Fully Paid',
    subtotal_amount: b.total_price,
    discount_amount: 0,
    promo_amount: 0,
    credit_applied_amount: 0,
    total_amount: b.total_price,
    processed_by_staff_id: vet.id,
    payment_choice: 'full',
  }));
  const vetTxnLines = vetTxns.map((t, i) => ({
    id: uuid('e5', i + 1),
    transaction_id: t.id,
    line_item_type: 'service',
    reference_id: vetService.id,
    description: 'Veterinary consultation',
    quantity: 1,
    unit_price: t.total_amount,
    line_total: t.total_amount,
  }));
  const consultations = vetBookings.map((b, i) => ({
    id: uuid('e6', i + 1),
    booking_id: b.id,
    pet_id: b.pet_id,
    veterinarian_id: vet.id,
    temperature: 38.5,
    weight: 4 + (i % 5),
    heart_rate: 100,
    respiratory_rate: 24,
    diagnosis: 'Routine check-up',
    reason_for_visit: 'Annual check-up',
    sold_at_pharmacy: false,
  }));
  const consultationItems = consultations.map((c, i) => ({
    id: uuid('e7', i + 1),
    consultation_id: c.id,
    item_type: 'professional_fee',
    description: 'Professional fee',
    amount: 500,
  }));

  // Grooming sessions for the first 15 grooming bookings.
  const groomingBookings = groomIds.map((id) => ({ id }));
  const groomingSessions = groomingBookings.map((b, i) => ({
    id: uuid('e8', i + 1),
    booking_id: b.id,
    assigned_groomer_id: pick(staffIds, i),
    queue_position: i + 1,
  }));

  // Care log entries and instructions for the first 15 stays.
  const careStays = stays.slice(0, N);
  const careLogs = careStays.map((s, i) => ({
    id: uuid('e9', i + 1),
    stay_id: s.id,
    care_type: 'Walking',
    scheduled_date: '2026-10-10',
    description: 'Morning walk - 15 min',
    time_block: 'Morning',
    status: 'Pending',
  }));
  const walking = careStays.map((s, i) => ({
    id: uuid('ea', i + 1),
    stay_id: s.id,
    time_block: 'Morning',
    duration_minutes: 15,
    notes: 'Gentle pace',
  }));
  const playing = careStays.map((s, i) => ({
    id: uuid('eb', i + 1),
    stay_id: s.id,
    time_block: 'Afternoon',
    duration_minutes: 20,
    notes: 'Fetch in the yard',
  }));
  const medication = careStays.map((s, i) => ({
    id: uuid('ec', i + 1),
    stay_id: s.id,
    medication_name: 'Amoxicillin',
    dose: '250',
    dose_unit: 'mg',
    scheduled_times: ['08:00'],
    administration_notes: 'Give with food',
  }));

  // Promo links for the first 15 bookings and transactions.
  const bookingPromos = bookings.slice(0, N).map((b, i) => ({
    id: uuid('ed', i + 1),
    booking_id: b.id,
    promo_id: pick(promos, i),
    applied_amount: 50,
  }));
  const txnPromos = txns.slice(0, N).map((t, i) => ({
    id: uuid('ee', i + 1),
    transaction_id: t,
    promo_id: pick(promos, i),
    is_activated: false,
  }));
  const promoScopes = Array.from({ length: N }, (_, i) => ({
    id: uuid('ef', i + 1),
    promo_id: pick(promos, i),
    service_id: services[i % services.length].id,
  }));

  // Credit: one balance per customer/branch pair, plus transactions against them.
  const balances: Array<{
    id: string;
    customer_id: string;
    branch_id: string;
    balance: number;
  }> = [];
  for (const c of customers) {
    for (const b of branches) {
      balances.push({
        id: uuid('f2', balances.length + 1),
        customer_id: c,
        branch_id: b,
        balance: 100,
      });
    }
  }
  const creditTxns = Array.from({ length: N }, (_, i) => ({
    id: uuid('f3', i + 1),
    credit_balance_id: pick(balances, i).id,
    transaction_type: 'issuance',
    amount: 100 + i,
    expires_at: new Date(Date.UTC(2026, 11, 31)).toISOString(),
  }));

  // Cancellation logs for 15 distinct bookings.
  const cancellationLogs = bookings.slice(0, N).map((b, i) => ({
    id: uuid('f4', i + 1),
    booking_id: b.id,
    customer_id: b.customer_id,
    branch_id: b.branch_id,
    event_type: 'cancellation',
    notice_period_met: true,
    enforcement_mode_applied: 'Strict',
    policy_violation: false,
    credit_issued: false,
    credit_review_status: 'not_applicable',
  }));

  const notifications = Array.from({ length: N }, (_, i) => ({
    id: uuid('f5', i + 1),
    recipient_customer_id: pick(customers, i),
    event_type: i % 2 === 0 ? 'booking_confirmed' : 'booking_cancelled',
    title: i % 2 === 0 ? 'Booking confirmed' : 'Booking cancelled',
    message: `Demo notification ${i + 1}`,
    is_read: i % 3 === 0,
  }));

  const activity = Array.from({ length: N }, (_, i) => ({
    id: uuid('f6', i + 1),
    branch_id: pick(branches, i),
    action: [
      'check_in',
      'check_out',
      'task_started',
      'task_completed',
      'task_reopened',
      'task_missed',
    ][i % 6],
    actor_staff_id: pick(staffIds, i),
    description: `Demo activity entry ${i + 1}`,
  }));

  const unavailability = Array.from({ length: N }, (_, i) => {
    const start = new Date(Date.UTC(2026, 9, 20 + i, 0, 0, 0));
    return {
      id: uuid('f1', i + 1),
      staff_id: pick(staffIds, i),
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + 86_400_000).toISOString(),
      reason: 'Demo leave',
      created_by: pick(staffIds, i + 1),
      status: 'approved',
      is_full_day: true,
      leave_type: ['Vacation Leave', 'Sick Leave', 'Other'][i % 3],
    };
  });

  const medicalNotes = allPets.slice(0, N).map((p, i) => ({
    id: uuid('f7', i + 1),
    pet_id: p.id,
    note_text: `Demo medical note ${i + 1}`,
    category: ['Medical Note', 'Allergy', 'Behavioral Flag'][i % 3],
    staff_id: pick(staffIds, i),
  }));

  const vaccinations = allPets.slice(0, N).map((p, i) => ({
    id: uuid('f8', i + 1),
    pet_id: p.id,
    vaccine_name: 'Rabies',
    date_administered: '2026-08-01',
    next_due_date: '2027-08-01',
    administered_by: pick(staffIds, i),
    notes: 'Demo vaccination record',
  }));

  const healthConditions = allPets.slice(0, N).map((p, i) => ({
    id: uuid('f9', i + 1),
    pet_id: p.id,
    conditions_text: 'No known conditions (demo)',
    updated_by_staff_id: pick(staffIds, i),
  }));

  const writes: Array<[string, Record<string, unknown>[]]> = [
    ['pets', extraPets],
    ['bookings', vetBookings],
    ['booking_items', vetBookingItems],
    ['transactions', vetTxns],
    ['transaction_line_items', vetTxnLines],
    ['consultations', consultations],
    ['consultation_line_items', consultationItems],
    ['grooming_sessions', groomingSessions],
    ['care_log_entries', careLogs],
    ['care_walking_instructions', walking],
    ['care_playing_instructions', playing],
    ['care_medication_instructions', medication],
    ['booking_promo_selections', bookingPromos],
    ['transaction_promo_selections', txnPromos],
    ['promo_scope', promoScopes],
    ['credit_balances', balances],
    ['credit_transactions', creditTxns],
    ['cancellation_logs', cancellationLogs],
    ['notifications', notifications],
    ['activity_log', activity],
    ['staff_unavailability_blocks', unavailability],
    ['pet_medical_notes', medicalNotes],
    ['pet_vaccination_records', vaccinations],
    ['pet_health_conditions', healthConditions],
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
