-- Payment/transactions model rework follow-up (feat/payment-transactions-rework).
--
-- WHY: payTransactionWithCredit originally called redeem_credit() and then
-- settle_transaction() as two independent RPCs. If the settle failed (e.g. a
-- concurrent cashier settled the same transaction between the app-side
-- 'Pending' check and the call), the credit was already burned with no
-- compensating re-credit - the customer silently lost the amount. This folds
-- both into ONE SECURITY DEFINER function so the whole thing is a single
-- Postgres transaction: any failure rolls the credit decrement back too.
--
-- Mirrors redeem_credit() + settle_transaction()'s own bodies; the rollup
-- rule is identical (net = total_price - discount_amount - promo_amount;
-- paid = sum(total_amount) over non-Pending booking_payment rows).

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

  -- Settle the transaction as 'Credit'.
  update public.transactions
  set payment_status = 'Fully Paid',
      payment_method = 'Credit',
      credit_applied_amount = p_amount,
      processed_by_staff_id = p_processed_by,
      updated_at = now()
  where id = p_transaction_id
  returning * into v_txn;

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
