-- Sprint 5 Epic A (#82): M08 Sales & Billing - transaction_type/
-- payment_method/payment_status enums and the transactions table.
--
-- Numbering note: the Sprint5-EpicA-Guide assumed Sprint 4's last migration
-- was ...032; the actual latest on this branch is 20260729066, so this
-- epic's migrations are renumbered starting at 067 per the Guide's own
-- Handoff State instruction (confirm-the-actual-count-before-branching).
--
-- payment_status is a dedicated concept from booking_status (M03) - it
-- tracks how much of a transaction has been collected, which can lag or
-- diverge from the booking's lifecycle (e.g. a Confirmed/In-Progress Hotel
-- booking is only Partially Paid until this epic's checkout collects the
-- remainder of the stay's total).
--
-- bank_name is a nullable sub-field of payment_method = 'Bank Transfer', not
-- a fork of the enum - the DSR (M14) needs BPI/BDO broken out, but every
-- other consumer of payment_method treats them identically.
--
-- customer_id and branch_id are denormalized onto transactions rather than
-- derived transitively through booking_id (nullable for misc sales) -
-- mirrors hotel_stays.pet_id's denormalization precedent, and is required
-- here specifically because a miscellaneous sale has no booking to derive
-- either from at all.

create type public.transaction_type as enum (
  'booking_payment',
  'miscellaneous_sale'
);

create type public.payment_method as enum (
  'Cash',
  'GCash',
  'Maya',
  'Card',
  'Bank Transfer',
  'Grabmart',
  'Pickaroo'
);

create type public.payment_status as enum (
  'Pending',
  'Fully Paid',
  'Partially Paid'
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  customer_id uuid not null references public.customer_profiles(id),
  branch_id uuid not null references public.branches(id),
  transaction_type public.transaction_type not null,
  payment_method public.payment_method not null,
  bank_name text,
  payment_status public.payment_status not null default 'Pending',
  subtotal_amount numeric(10, 2) not null,
  discount_amount numeric(10, 2) not null default 0,
  promo_amount numeric(10, 2) not null default 0,
  credit_applied_amount numeric(10, 2) not null default 0,
  -- Computed server-side as SUM(transaction_line_items.line_total) - never
  -- trusted from client input (Issue #84 dev notes).
  total_amount numeric(10, 2) not null,
  payment_reference text,
  -- Free-text item label for a miscellaneous sale. NOT NULL only when
  -- transaction_type = 'miscellaneous_sale' - enforced by the CHECK below,
  -- mirrored in the misc_sale_item line item's own description (Issue #85).
  misc_sale_description text,
  webhook_confirmed_at timestamptz,
  processed_by_staff_id uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_booking_id_matches_type check (
    (transaction_type = 'miscellaneous_sale' and booking_id is null)
    or (transaction_type = 'booking_payment' and booking_id is not null)
  ),
  constraint transactions_bank_name_requires_bank_transfer check (
    bank_name is null or payment_method = 'Bank Transfer'
  ),
  constraint transactions_misc_sale_description_matches_type check (
    (transaction_type = 'miscellaneous_sale' and misc_sale_description is not null)
    or (transaction_type = 'booking_payment' and misc_sale_description is null)
  )
);

create index transactions_booking_id_idx on public.transactions(booking_id);
create index transactions_customer_id_idx on public.transactions(customer_id);
create index transactions_branch_id_idx on public.transactions(branch_id);

alter table public.transactions enable row level security;

-- Two-tier write shape, but narrower than the usual "all staff read, Admin/
-- Superadmin write": money-handling roles (Cashier plus the roles already
-- trusted to Mark a booking Paid - see BOOKING_MARK_PAID_ROLES in
-- booking.types.ts) can create transactions; only Admin/Superadmin can
-- correct or remove one after the fact (per explicit request - see the
-- UPDATE/DELETE policies below).
create policy "Money-handling staff can read all transactions"
  on public.transactions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Superadmin', 'Admin', 'Supervisor', 'Receptionist', 'Cashier'
    )
  );

create policy "Customers can read their own transactions"
  on public.transactions
  for select
  to authenticated
  using (customer_id = auth.uid());

create policy "Money-handling staff can create transactions"
  on public.transactions
  for insert
  to authenticated
  with check (
    public.current_staff_role() in (
      'Superadmin', 'Admin', 'Supervisor', 'Receptionist', 'Cashier'
    )
  );

-- Update/delete restricted to Admin/Superadmin, and further scoped to
-- miscellaneous_sale rows only - booking-payment transactions stay
-- append-only for every role (a checkout mistake is corrected by re-running
-- checkout, not by hand-editing a payment record).
create policy "Admins and superadmins can update miscellaneous sales"
  on public.transactions
  for update
  to authenticated
  using (
    public.current_staff_role() in ('Admin', 'Superadmin')
    and transaction_type = 'miscellaneous_sale'
  )
  with check (
    public.current_staff_role() in ('Admin', 'Superadmin')
    and transaction_type = 'miscellaneous_sale'
  );

create policy "Admins and superadmins can delete miscellaneous sales"
  on public.transactions
  for delete
  to authenticated
  using (
    public.current_staff_role() in ('Admin', 'Superadmin')
    and transaction_type = 'miscellaneous_sale'
  );
