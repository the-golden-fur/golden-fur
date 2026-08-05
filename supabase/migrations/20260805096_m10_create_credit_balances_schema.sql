-- Sprint 5 Epic B (#90): credit_balances table.
--
-- Per-customer, per-branch credit balance - branch-locked and non-
-- transferable (Modules-Features). UNIQUE(customer_id, branch_id) enforces
-- the branch-lock at the schema level; CHECK balance >= 0 is a second line
-- of defense behind the application-level min(balance, total) cap Epic A's
-- checkout applies on redemption.
--
-- CROSS-EPIC: Epic A's checkoutAggregation.service.ts (#84, already merged)
-- reads this table via server/src/features/billing/services/
-- creditStub.service.ts's stub interface - that stub's TODO(Epic B, #90)
-- comment names this table and this issue by number.

create table public.credit_balances (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  branch_id uuid not null references public.branches(id),
  balance numeric(10, 2) not null default 0.00 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_balances_customer_branch_uniq unique (customer_id, branch_id)
);

create index credit_balances_customer_id_idx on public.credit_balances(customer_id);
create index credit_balances_branch_id_idx on public.credit_balances(branch_id);

alter table public.credit_balances enable row level security;

-- Read-only for everyone who can see it (AC-4): the owning customer reads
-- their own row(s); Cashier/Admin/Superadmin read any. No write policy for
-- `authenticated` - only the server's service-role client writes (via the
-- issue_credit() function below and future redemption/expiry paths).
create policy "Customers can read their own credit balances"
  on public.credit_balances
  for select
  to authenticated
  using (customer_id = auth.uid());

create policy "Cashiers and admins can read any credit balance"
  on public.credit_balances
  for select
  to authenticated
  using (public.current_staff_role() in ('Superadmin', 'Admin', 'Cashier'));
