-- Sprint 5 Epic B (#90): credit_transactions table + the issue_credit()
-- atomic helper.
--
-- History of issuance/redemption/expiry events. transaction_type is plain
-- text, not an enum (same convention as cancellation_logs.event_type above
-- and transaction_line_items.line_item_type). Documented allowed values:
-- 'issuance', 'redemption', 'expiry'. amount is signed - positive for
-- issuance, negative for redemption/expiry - so SUM(amount) for a
-- credit_balances row always equals its balance.
--
-- transaction_id FKs to Epic A's already-merged public.transactions (#82) -
-- this table's only forward dependency on Epic A's schema, populated for
-- redemption rows once Epic A's credit-stub swap lands (tracked in
-- creditStub.service.ts, out of this epic's own scope - see this batch's
-- custom doc's Open Items).
--
-- expired_at (ADDITION beyond the Design sheet's literal column list): the
-- Design sheet's credit_transactions has no way to tell whether a given
-- 'issuance' row has already been swept by expire_credits() below without
-- it - there's no other row-level link between an issuance and the expiry
-- row that eventually offsets it. Nullable, only ever set (to the sweep
-- timestamp) on 'issuance' rows once expire_credits() has processed them;
-- always NULL for 'redemption'/'expiry' rows.

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  credit_balance_id uuid not null references public.credit_balances(id),
  transaction_type text not null
    check (transaction_type in ('issuance', 'redemption', 'expiry')),
  amount numeric(10, 2) not null,
  cancellation_log_id uuid references public.cancellation_logs(id),
  transaction_id uuid references public.transactions(id),
  expires_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  constraint credit_transactions_amount_sign_matches_type check (
    (transaction_type = 'issuance' and amount > 0)
    or (transaction_type in ('redemption', 'expiry') and amount < 0)
  ),
  constraint credit_transactions_expired_at_only_on_issuance check (
    expired_at is null or transaction_type = 'issuance'
  )
);

create index credit_transactions_credit_balance_id_idx
  on public.credit_transactions(credit_balance_id);
create index credit_transactions_cancellation_log_id_idx
  on public.credit_transactions(cancellation_log_id);
create index credit_transactions_transaction_id_idx
  on public.credit_transactions(transaction_id);
-- Sweep query in expire_credits() (099) filters on exactly this shape.
create index credit_transactions_expiry_sweep_idx
  on public.credit_transactions(expires_at)
  where transaction_type = 'issuance' and expired_at is null;

alter table public.credit_transactions enable row level security;

create policy "Customers can read their own credit transaction history"
  on public.credit_transactions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.credit_balances cb
      where cb.id = credit_transactions.credit_balance_id
        and cb.customer_id = auth.uid()
    )
  );

create policy "Cashiers and admins can read any credit transaction history"
  on public.credit_transactions
  for select
  to authenticated
  using (public.current_staff_role() in ('Superadmin', 'Admin', 'Cashier'));

-- ---------------------------------------------------------------------------
-- issue_credit(): atomic increment-balance + write-issuance-row helper.
--
-- AC-1 (#93) requires the balance increment and the issuance
-- credit_transactions row to be atomic. A plain two-step application-layer
-- select-then-write (the pattern policy_configurations' own
-- updatePolicyConfiguration() already uses elsewhere in this codebase) can't
-- guarantee that across two separate PostgREST round trips, so this is a
-- single PL/pgSQL function instead - SECURITY DEFINER so the server's
-- service-role client can call it as a plain RPC while the whole increment +
-- insert happens inside one Postgres transaction.
-- ---------------------------------------------------------------------------
create or replace function public.issue_credit(
  p_customer_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_cancellation_log_id uuid,
  p_expires_at timestamptz
)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_id uuid;
  v_transaction public.credit_transactions;
begin
  if p_amount <= 0 then
    raise exception 'issue_credit: amount must be positive';
  end if;

  insert into public.credit_balances (customer_id, branch_id, balance)
  values (p_customer_id, p_branch_id, p_amount)
  on conflict (customer_id, branch_id)
  do update set
    balance = public.credit_balances.balance + excluded.balance,
    updated_at = now()
  returning id into v_balance_id;

  insert into public.credit_transactions (
    credit_balance_id, transaction_type, amount, cancellation_log_id, expires_at
  ) values (
    v_balance_id, 'issuance', p_amount, p_cancellation_log_id, p_expires_at
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke all on function public.issue_credit(uuid, uuid, numeric, uuid, timestamptz) from public;
grant execute on function public.issue_credit(uuid, uuid, numeric, uuid, timestamptz) to service_role;
