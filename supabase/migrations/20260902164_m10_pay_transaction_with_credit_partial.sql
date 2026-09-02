-- Architectural-Change-History "In Progress" row (Matthew) + chat follow-up:
-- partial settlement must spawn a remaining-balance transaction, and this must
-- also work when paying with account credit. Until now
-- pay_transaction_with_credit() was full-cover only (payTransactionWithCredit
-- 400'd with "split it first" when the balance didn't cover the whole charge).
--
-- This version applies whatever credit amount the caller passes (p_amount, the
-- service caps it at min(available, charge)); when that is less than the
-- transaction's total it shrinks the settled row + its line item to p_amount
-- and spawns a new Pending 'balance' transaction for the leftover - identical
-- mechanism to settle_transaction() (20260902163).
--
-- Signature unchanged (still 3 args), so plain CREATE OR REPLACE. Based
-- verbatim on 20260901158_m10_pay_transaction_with_credit_rpc.sql.

create or replace function public.pay_transaction_with_credit(
  p_transaction_id uuid,
  p_amount numeric,
  p_processed_by uuid
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn public.transactions;
  v_balance public.credit_balances;
  v_booking public.bookings;
  v_net numeric(10, 2);
  v_paid numeric(10, 2);
  v_new_status public.payment_status;
  v_full numeric(10, 2);
  v_leftover numeric(10, 2);
  v_leftover_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'pay_transaction_with_credit: amount must be positive';
  end if;

  select * into v_txn
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'pay_transaction_with_credit: transaction % not found', p_transaction_id;
  end if;

  if v_txn.transaction_type <> 'booking_payment' then
    raise exception 'pay_transaction_with_credit: transaction % is not a booking payment', p_transaction_id;
  end if;

  if v_txn.payment_status = 'Fully Paid' then
    raise exception 'pay_transaction_with_credit: transaction % is already Fully Paid', p_transaction_id;
  end if;

  if v_txn.booking_id is null then
    raise exception 'pay_transaction_with_credit: transaction % has no booking to roll up', p_transaction_id;
  end if;

  v_full := round(v_txn.total_amount, 2);

  if round(p_amount, 2) > v_full + 0.001 then
    raise exception
      'pay_transaction_with_credit: amount % exceeds transaction total %',
      p_amount, v_full;
  end if;

  v_leftover := round(v_full - p_amount, 2);

  -- Redeem the credit (redeem_credit()'s body, inlined so it shares this txn).
  select * into v_balance
  from public.credit_balances
  where customer_id = v_txn.customer_id
    and branch_id = v_txn.branch_id
  for update;

  if not found then
    raise exception
      'pay_transaction_with_credit: no credit balance for customer % at branch %',
      v_txn.customer_id, v_txn.branch_id;
  end if;

  if v_balance.balance < p_amount then
    raise exception
      'pay_transaction_with_credit: balance % is less than requested %',
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
  );

  -- Partial credit: shrink this row + its line item to the amount covered
  -- before flipping it Fully Paid, then spawn a Pending 'balance' row below.
  if v_leftover > 0 then
    update public.transactions
    set subtotal_amount = p_amount,
        total_amount = p_amount
    where id = p_transaction_id;

    update public.transaction_line_items
    set unit_price = p_amount,
        line_total = p_amount
    where transaction_id = p_transaction_id;
  end if;

  -- Settle the transaction as 'Credit'.
  update public.transactions
  set payment_status = 'Fully Paid',
      payment_method = 'Credit',
      credit_applied_amount = p_amount,
      processed_by_staff_id = p_processed_by,
      updated_at = now()
  where id = p_transaction_id
  returning * into v_txn;

  if v_leftover > 0 then
    insert into public.transactions (
      booking_id, customer_id, branch_id, transaction_type,
      payment_method, payment_status, payment_choice,
      subtotal_amount, total_amount, processed_by_staff_id
    ) values (
      v_txn.booking_id, v_txn.customer_id, v_txn.branch_id, 'booking_payment',
      'Cash', 'Pending', 'balance',
      v_leftover, v_leftover, p_processed_by
    )
    returning id into v_leftover_id;

    insert into public.transaction_line_items (
      transaction_id, line_item_type, description, quantity, unit_price, line_total
    ) values (
      v_leftover_id, 'service', 'Remaining balance', 1, v_leftover, v_leftover
    );
  end if;

  -- Roll the parent booking's payment_status up.
  select * into v_booking
  from public.bookings
  where id = v_txn.booking_id
  for update;

  v_net := coalesce(v_booking.total_price, 0)
         - coalesce(v_booking.discount_amount, 0)
         - coalesce(v_booking.promo_amount, 0);

  select coalesce(sum(t.total_amount), 0)
    into v_paid
  from public.transactions t
  where t.booking_id = v_booking.id
    and t.transaction_type = 'booking_payment'
    and t.payment_status <> 'Pending';

  v_new_status := case
    when v_paid <= 0 then 'Pending'::public.payment_status
    when v_paid >= v_net then 'Fully Paid'::public.payment_status
    else 'Partially Paid'::public.payment_status
  end;

  update public.bookings
  set payment_status = v_new_status,
      paid_at = case
        when v_new_status = 'Fully Paid' then now()
        else paid_at
      end,
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.pay_transaction_with_credit(uuid, numeric, uuid) from public;
grant execute on function public.pay_transaction_with_credit(uuid, numeric, uuid) to service_role;
