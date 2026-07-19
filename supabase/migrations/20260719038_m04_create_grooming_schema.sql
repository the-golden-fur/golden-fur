-- Sprint 3 Epic A (#61): M04 grooming execution schema - grooming_status enum
-- + grooming_sessions.
--
-- Numbering note: the Guide assumed Sprint 2 Epic B's last migration was
-- ...025; the actual last merged migration on dev is 20260718037, so this
-- epic's migrations are renumbered 038-040 per the Guide's own Handoff State
-- instruction (matching how Epic B itself renumbered 026-028 to 035-037).
--
-- grooming_sessions carries no price columns - pricing is already snapshotted
-- onto bookings.total_price at booking time (Sprint 2 Epic B); this table is
-- purely an execution/queue record, not a second source of truth for price.

create type public.grooming_status as enum (
  'Waiting',
  'In Progress',
  'Completed'
);

-- ---------------------------------------------------------------------------
-- grooming_sessions
-- ---------------------------------------------------------------------------
-- One row per confirmed Grooming booking. booking_id is UNIQUE (not
-- ON DELETE CASCADE - bookings are never hard-deleted, cancellation is a
-- status change) so a plain FK + UNIQUE is sufficient to guarantee one
-- grooming_sessions row per Grooming booking.

create table public.grooming_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id),
  -- Denormalized from bookings.assigned_staff_id at creation time, purely so
  -- the Groomer Dashboard's primary query ("today's sessions for this
  -- groomer") doesn't need to join through bookings just to filter.
  assigned_groomer_id uuid not null references public.staff_profiles(id),
  status public.grooming_status not null default 'Waiting',
  -- Optional explicit ordering override; when NULL, the dashboard falls back
  -- to bookings.scheduled_start (chronological).
  queue_position integer,
  -- Set when status transitions Waiting -> In Progress.
  started_at timestamptz,
  -- Set when status transitions In Progress -> Completed; triggers the
  -- billing-ready handoff (see grooming.service.ts).
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index grooming_sessions_groomer_idx
  on public.grooming_sessions(assigned_groomer_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- A Groomer may SELECT/UPDATE only their own assigned_groomer_id rows;
-- Admin/Supervisor/Superadmin may SELECT/UPDATE all rows, scoped to their own
-- branch (resolved via a join through bookings.branch_id, since
-- grooming_sessions itself carries no branch_id column) - Superadmin is
-- unrestricted, mirroring the "Superadmin can select either branch" pattern
-- established by M03 Process 6 (Receptionist Bookings Queue). No INSERT
-- policy is declared for staff at all - rows are created by the server's
-- service-role client (see grooming.service.ts), matching the Guide's "only
-- appropriate write paths can mutate" convention already used for bookings.

alter table public.grooming_sessions enable row level security;

create policy "Groomers can read their own grooming sessions"
  on public.grooming_sessions
  for select
  to authenticated
  using (assigned_groomer_id = auth.uid());

create policy "Groomers can update their own grooming sessions"
  on public.grooming_sessions
  for update
  to authenticated
  using (assigned_groomer_id = auth.uid())
  with check (assigned_groomer_id = auth.uid());

create policy "Admins and supervisors can read grooming sessions at their branch"
  on public.grooming_sessions
  for select
  to authenticated
  using (
    public.current_staff_role() in ('Admin', 'Supervisor')
    and exists (
      select 1
      from public.bookings b
      join public.staff_profiles sp on sp.id = auth.uid()
      where b.id = grooming_sessions.booking_id
        and b.branch_id = sp.branch_id
    )
  );

create policy "Admins and supervisors can update grooming sessions at their branch"
  on public.grooming_sessions
  for update
  to authenticated
  using (
    public.current_staff_role() in ('Admin', 'Supervisor')
    and exists (
      select 1
      from public.bookings b
      join public.staff_profiles sp on sp.id = auth.uid()
      where b.id = grooming_sessions.booking_id
        and b.branch_id = sp.branch_id
    )
  )
  with check (
    public.current_staff_role() in ('Admin', 'Supervisor')
    and exists (
      select 1
      from public.bookings b
      join public.staff_profiles sp on sp.id = auth.uid()
      where b.id = grooming_sessions.booking_id
        and b.branch_id = sp.branch_id
    )
  );

create policy "Superadmins can read all grooming sessions"
  on public.grooming_sessions
  for select
  to authenticated
  using (public.current_staff_role() = 'Superadmin');

create policy "Superadmins can update all grooming sessions"
  on public.grooming_sessions
  for update
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');
