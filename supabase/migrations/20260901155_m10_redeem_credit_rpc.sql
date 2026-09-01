-- Payment/transactions model rework (feat/payment-transactions-rework), 6/8.
--
-- WHY: the inverse of issue_credit() (20260805097). When a customer pays a
-- booking balance with account credit, the credit_balances row must be
-- decremented and a matching 'redemption' credit_transactions row written
-- atomically - the same "can't span two PostgREST round trips" reasoning that
-- made issue_credit() a function. SECURITY DEFINER, granted to service_role
-- only.
--
-- The caller is expected to pass an amount already capped at
-- min(balance, amount_owed); this function re-checks balance >= p_amount
-- under a row lock and raises if not, so a stale client cap can never drive
-- the balance negative (the credit_balances.balance >= 0 CHECK is the last
-- line of defense behind this).
--
-- amount is stored negative (-p_amount) to satisfy
-- credit_transactions_amount_sign_matches_type (redemption rows must be < 0)
-- and to keep SUM(amount) == balance. transaction_id links the redemption to
-- the transactions row it paid down.

create or replace function public.redeem_credit(
  p_customer_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_transaction_id uuid
)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.credit_balances;
  v_transaction public.credit_transactions;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'redeem_credit: amount must be positive';
  end if;

  select * into v_balance
  from public.credit_balances
  where customer_id = p_customer_id
    and branch_id = p_branch_id
  for update;

  if not found then
    raise exception
      'redeem_credit: no credit balance for customer % at branch %',
      p_customer_id, p_branch_id;
  end if;

  if v_balance.balance < p_amount then
    raise exception
      'redeem_credit: balance % is less than requested %',
      v_balance.balance, p_amount;
  end if;

  update public.credit_balances
  set balance = balance - p_amount,
      updated_at = now()
  where id = v_balance.id;

  insert into public.credit_transactions (
    credit_balance_id,
    transaction_type,
    amount,
    transaction_id
  ) values (
    v_balance.id,
    'redemption',
    -p_amount,
    p_transaction_id
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke all on function public.redeem_credit(uuid, uuid, numeric, uuid) from public;
grant execute on function public.redeem_credit(uuid, uuid, numeric, uuid) to service_role;
