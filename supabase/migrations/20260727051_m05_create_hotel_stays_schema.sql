-- Sprint 4 Epic A (#72): M05 hotel stay execution schema - hotel_stays.
-- Depends on #71 (cages) and Sprint 2 Epic B (bookings).

create table public.hotel_stays (
  id uuid primary key default gen_random_uuid(),
  -- One hotel_stays row per confirmed Hotel booking, mirroring
  -- grooming_sessions.booking_id's UNIQUE convention (Sprint 3).
  booking_id uuid not null unique references public.bookings(id),
  -- Denormalized from the booking for care-log/pet-history queries,
  -- matching consultations.pet_id's rationale (Sprint 3).
  pet_id uuid not null references public.pets(id),
  cage_id uuid not null references public.cages(id),
  status text not null default 'Active' check (status in ('Active', 'Completed')),
  check_in_at timestamptz,
  scheduled_check_out_date date not null,
  actual_check_out_at timestamptz,
  -- 50% downpayment already collected at booking time (bookings.downpayment_amount,
  -- M03 Process 1); copied here so checkout reconciliation (#78) doesn't need
  -- to join back through bookings.
  downpayment_amount numeric(10, 2) not null check (downpayment_amount >= 0),
  -- NULL when checkout is on time - never zero - so downstream billing can
  -- distinguish "no extension fee applied" from "an extension fee of exactly
  -- ₱0 was calculated" (#78 dev notes).
  extension_fee numeric(10, 2),
  notify_opt_in boolean not null default false,
  created_by_staff_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hotel_stays_pet_id_idx on public.hotel_stays(pet_id);
create index hotel_stays_status_idx on public.hotel_stays(status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Staff-only, no customer-facing access at all, matching daycare_sessions'
-- convention (Sprint 3) - customers see their booking status via M03, not
-- this execution record. Branch scope is resolved by joining through
-- cages.branch_id, since hotel_stays itself carries no branch_id column.

alter table public.hotel_stays enable row level security;

create policy "Staff can read hotel stays at their branch"
  on public.hotel_stays
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor'
    )
    and cage_id in (
      select c.id from public.cages c
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Staff can create hotel stays at their branch"
  on public.hotel_stays
  for insert
  to authenticated
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor'
    )
    and cage_id in (
      select c.id from public.cages c
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Staff can update hotel stays at their branch"
  on public.hotel_stays
  for update
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor'
    )
    and cage_id in (
      select c.id from public.cages c
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  )
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor'
    )
    and cage_id in (
      select c.id from public.cages c
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Superadmins can manage all hotel stays"
  on public.hotel_stays
  for all
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');
