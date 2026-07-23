-- Sprint 3 Epic A (#62): M06 daycare execution schema - daycare_sessions.
--
-- Also adds branches.daycare_checkin_cutoff, which the Guide's #65 dev notes
-- assume already exists ("Southwoods reads from its own branch-config
-- value... confirm the exact column name against the merged M01 schema") -
-- no such column exists anywhere in the merged M01 schema, so it's added
-- here rather than deferred, since #65's cutoff check has nothing to read
-- otherwise. Makati's 4:00 PM cutoff stays hardcoded in application code
-- (daycareCheckIn.service.ts) per "Makati is a fixed 4:00 PM" - only
-- Southwoods reads this column. Both branches get the same seeded default;
-- only Southwoods' value is ever actually read.

alter table public.branches
  add column daycare_checkin_cutoff time not null default '16:00:00';

-- ---------------------------------------------------------------------------
-- daycare_sessions
-- ---------------------------------------------------------------------------
-- Single/partial-day supervision session record. booking_id is NULLABLE,
-- unlike grooming_sessions.booking_id - a walk-in session legitimately has no
-- booking to reference. branch_id is stored directly (not just derivable by
-- joining through bookings) so the cutoff-enforcement query stays a
-- single-table read with no join in the hot path.

create table public.daycare_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  pet_id uuid not null references public.pets(id),
  branch_id uuid not null references public.branches(id),
  created_by_staff_id uuid not null references public.staff_profiles(id),
  status text not null default 'Active' check (status in ('Active', 'Completed')),
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  -- ₱100 flat if elapsed <= 1 hour, else ₱100 + ₱50 x each succeeding hour
  -- (rounded up). Computed and stored at checkout, not recalculated later -
  -- see daycareBilling.service.ts.
  computed_charge numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial UNIQUE: only advance-booked sessions (non-null booking_id) may not
-- duplicate a booking; walk-ins (booking_id IS NULL) are unrestricted.
create unique index daycare_sessions_booking_id_key
  on public.daycare_sessions(booking_id)
  where booking_id is not null;

create index daycare_sessions_branch_status_idx
  on public.daycare_sessions(branch_id, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Daycare check-in/checkout is staff-only (unlike M03 bookings, which
-- customers can read/write directly) - no customer-facing policy exists at
-- all. Receptionist/Admin/Supervisor/Superadmin may SELECT/INSERT/UPDATE rows
-- at their own branch; Superadmin is unrestricted, mirroring the branch-scope
-- pattern used for grooming_sessions (...038) and M03 Process 6.

alter table public.daycare_sessions enable row level security;

create policy "Staff can read daycare sessions at their branch"
  on public.daycare_sessions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Staff can create daycare sessions at their branch"
  on public.daycare_sessions
  for insert
  to authenticated
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Staff can update daycare sessions at their branch"
  on public.daycare_sessions
  for update
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  )
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Superadmins can manage all daycare sessions"
  on public.daycare_sessions
  for all
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');
