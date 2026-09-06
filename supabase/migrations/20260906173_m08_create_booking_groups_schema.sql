-- Multi-booking checkout: several independent bookings rows (each possibly
-- a different pet, category, date/time, staff/cage) can be created and paid
-- for together as a single cart - one shared discount, one shared promo, one
-- shared downpayment/payment-scheme decision, settled via one shared
-- transaction (or downpayment+balance transaction pair, mirroring
-- create_initial_booking_charge - 20260902162). booking_groups is the row
-- that carries that shared checkout state; each bookings row it covers is
-- linked back to it via the new bookings.booking_group_id column, but a
-- booking never requires a group - single-booking checkout is unaffected
-- (booking_group_id stays null).
--
-- Column shape deliberately mirrors bookings' own payment columns
-- (downpayment_amount, downpayment_required, downpayment_due_at,
-- payment_status, paid_at - see 20260718035 / 20260829147 / 20260901150)
-- and transactions' discount/promo columns (discount_amount, promo_amount -
-- see 20260731068 / 20260726049), since the group is standing in for what
-- would otherwise be per-booking values. payment_status reuses the exact
-- same public.payment_status enum bookings.payment_status was migrated onto
-- (20260901150) rather than inventing a parallel one.
--
-- net_total is the group's post-discount/promo total (analogous to
-- transactions.total_amount), computed and trusted server-side only - same
-- rationale as transactions.total_amount's "never trusted from client input"
-- comment (20260731068).

create table public.booking_groups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  branch_id uuid not null references public.branches(id),
  -- Set when a receptionist builds the cart on behalf of a walk-in/phone-in
  -- client; NULL for self-service portal checkout - mirrors
  -- bookings.created_by_staff_id (20260718035).
  created_by_staff_id uuid references public.staff_profiles(id),
  selected_discount_id uuid references public.discounts(id),
  selected_promo_id uuid references public.promos(id),
  discount_amount numeric(10, 2) not null default 0,
  promo_amount numeric(10, 2) not null default 0,
  -- Post-discount/promo total for the whole cart; computed server-side only.
  net_total numeric(10, 2) not null,
  downpayment_amount numeric(10, 2),
  downpayment_required boolean not null default false,
  downpayment_due_at timestamptz,
  payment_status public.payment_status not null default 'Pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings
  add column booking_group_id uuid references public.booking_groups(id);

create index bookings_booking_group_id_idx on public.bookings(booking_group_id);
create index booking_groups_customer_id_idx on public.booking_groups(customer_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- booking_groups is created and updated only by the API layer's checkout
-- endpoints (via create_initial_booking_group_charge - 20260906175 - and its
-- surrounding service-role Supabase client code), never by a direct client
-- table write - so, unlike bookings (which has customer-scoped INSERT/UPDATE
-- policies for self-service portal bookings) and transactions (which has
-- staff-scoped INSERT and Admin/Superadmin UPDATE/DELETE policies), no
-- INSERT/UPDATE/DELETE policy is declared here at all: RLS enabled with zero
-- write policies denies every authenticated-role write outright, and the
-- service role bypasses RLS entirely regardless of policies. Only read
-- access is granted, using the exact same two-tier idiom bookings' own read
-- policies use (20260718035): staff read-all via current_staff_role(), and
-- a customer reads only their own rows via customer_id = auth.uid().

alter table public.booking_groups enable row level security;

create policy "Staff can read booking groups"
  on public.booking_groups
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own booking groups"
  on public.booking_groups
  for select
  to authenticated
  using (customer_id = auth.uid());
