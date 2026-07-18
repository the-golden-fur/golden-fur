-- Sprint 2 Epic B (#50): M03 booking schema - booking_status enum, bookings,
-- booking_addons, staff_picker_preferences.
--
-- Numbering note: the Epic B Guide assumed Epic A's last migration was ...023;
-- the actual last merged migration is 20260715034, so this epic's migrations
-- are renumbered 035-037 per the Guide's own Handoff State instruction
-- (matching how Epic A itself renumbered 021-023 to 032-034).
--
-- service_category is REUSED from Epic A's migration (20260715032) - it is
-- deliberately not redeclared here, so a booking's category can never drift
-- from a real services.category value.

create type public.booking_status as enum (
  'Confirmed',
  'Completed',
  'Cancelled',
  'No-show',
  -- Reserved primarily for M07 follow-up-consultation bookings (Sprint 3).
  -- Epic B's one use: a pay-at-counter booking whose payment_confirmed stub
  -- gate has not cleared yet (#51 AC-4 / #58 AC-4) persists as Pending until
  -- the Sprint 5 M08 cashier confirmation flow exists to promote it.
  'Pending'
);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  -- Validated server-side that pet_id belongs to customer_id (#51 AC-6).
  pet_id uuid not null references public.pets(id),
  -- Drives Veterinary eligibility via branches.is_vet_branch (#53).
  branch_id uuid not null references public.branches(id),
  -- Set when a receptionist creates the booking on behalf of a walk-in /
  -- phone-in client; NULL for self-service portal bookings.
  created_by_staff_id uuid references public.staff_profiles(id),
  service_category public.service_category not null,
  service_id uuid references public.services(id),
  package_id uuid references public.packages(id),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  -- Groomer/Veterinarian only; NULL for Hotel/Daycare, where staff-to-pet
  -- assignment is handled internally by M05/M06 in a later sprint.
  assigned_staff_id uuid references public.staff_profiles(id),
  status public.booking_status not null default 'Confirmed',
  -- Snapshot at booking time, inclusive of add-ons.
  total_price numeric(10, 2) not null check (total_price >= 0),
  -- Hotel only; 50% of total_price hardcoded per Modules-Features baseline -
  -- policy_configurations.downpayment_percent is Sprint 5 (M09) scope.
  downpayment_amount numeric(10, 2) check (downpayment_amount >= 0),
  -- STUB column - plain text mirroring M08's future payment_method enum in
  -- shape; the real enum lives with the Sprint 5 transactions table.
  payment_method text check (
    payment_method in (
      'Cash', 'GCash', 'Maya', 'Card', 'Bank Transfer', 'Grabmart', 'Pickaroo'
    )
  ),
  -- STUB gate for automatic confirmation (#51 AC-4). Client-declared for
  -- online payment - no real PayMongo webhook exists yet; trust boundary
  -- flagged in the Guide's Issue #58 dev notes for the Sprint 5 reviewer.
  payment_confirmed boolean not null default false,
  special_instructions text,
  cancelled_at timestamptz,
  cancellation_reason text,
  -- Exists now so Sprint 5's "free reschedule allowance" fee calculation has
  -- data to read; this epic does not itself calculate any fee.
  reschedule_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one of service_id/package_id, mirroring Epic A's promo_scope
  -- pattern - in SQL, not only application-layer (#50 AC-4).
  check (num_nonnulls(service_id, package_id) = 1),
  check (scheduled_end > scheduled_start)
);

create index bookings_customer_id_idx on public.bookings(customer_id);
create index bookings_branch_start_idx
  on public.bookings(branch_id, scheduled_start);
-- Partial: the RPC's booking-overlap condition and every capacity count only
-- ever look at Confirmed rows.
create index bookings_staff_confirmed_idx
  on public.bookings(assigned_staff_id, scheduled_start)
  where status = 'Confirmed';

-- ---------------------------------------------------------------------------
-- booking_addons
-- ---------------------------------------------------------------------------
-- Add-ons are modeled as ordinary services (e.g. nail trim, teeth brushing).

create table public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null
    references public.bookings(id) on delete cascade,
  -- RESTRICT, mirroring package_services' rationale - an add-on referenced by
  -- a historical booking must never silently vanish.
  service_id uuid not null
    references public.services(id) on delete restrict,
  -- Snapshot so a later price change to the underlying service doesn't
  -- retroactively alter historical bookings.
  price_at_booking numeric(10, 2) not null check (price_at_booking >= 0)
);

create index booking_addons_booking_id_idx
  on public.booking_addons(booking_id);

-- ---------------------------------------------------------------------------
-- staff_picker_preferences
-- ---------------------------------------------------------------------------
-- One preference row per booking; Grooming/Veterinary only.

create table public.staff_picker_preferences (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique
    references public.bookings(id) on delete cascade,
  preference_type text not null
    check (preference_type in ('no_preference', 'specific')),
  -- Set only when preference_type = 'specific'.
  preferred_staff_id uuid references public.staff_profiles(id),
  check (preference_type = 'specific' or preferred_staff_id is null),
  -- Audit flag recording whether Issue #52's toggle was enabled at the time
  -- of this booking, independent of later toggle changes.
  staff_picker_shown boolean not null default true
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- bookings is the first M03 table a customer writes to directly rather than
-- only staff, so alongside the usual staff SELECT-all (current_staff_role()),
-- a customer-scoped tier lets a customer_profiles-linked user SELECT/INSERT/
-- UPDATE only their own rows (matched via customer_id = auth.uid();
-- customer_profiles.id is the auth.users id). Staff writes go through the
-- server's booking endpoints (service-role client), so no staff write policy
-- is declared - matching the Guide's "only appropriate write paths can
-- mutate".

alter table public.bookings enable row level security;
alter table public.booking_addons enable row level security;
alter table public.staff_picker_preferences enable row level security;

create policy "Staff can read bookings"
  on public.bookings
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own bookings"
  on public.bookings
  for select
  to authenticated
  using (customer_id = auth.uid());

create policy "Customers can create their own bookings"
  on public.bookings
  for insert
  to authenticated
  with check (customer_id = auth.uid());

create policy "Customers can update their own bookings"
  on public.bookings
  for update
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy "Staff can read booking addons"
  on public.booking_addons
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own booking addons"
  on public.booking_addons
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and b.customer_id = auth.uid()
    )
  );

create policy "Customers can create their own booking addons"
  on public.booking_addons
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and b.customer_id = auth.uid()
    )
  );

create policy "Staff can read staff picker preferences"
  on public.staff_picker_preferences
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own staff picker preferences"
  on public.staff_picker_preferences
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and b.customer_id = auth.uid()
    )
  );

create policy "Customers can create their own staff picker preferences"
  on public.staff_picker_preferences
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and b.customer_id = auth.uid()
    )
  );
