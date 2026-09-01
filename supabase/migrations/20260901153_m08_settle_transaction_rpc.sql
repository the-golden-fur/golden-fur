-- Payment/transactions model rework (feat/payment-transactions-rework), 4/8.
--
-- WHY: in the reworked model a booking_payment transaction is created up
-- front in 'Pending' state (at booking time, or via add_booking_payment())
-- and later "settled" when the cashier actually collects the money. Settling
-- must atomically (a) flip the transaction to Fully Paid with its real
-- payment details and (b) recompute the parent booking's payment_status
-- rollup - a two-round-trip application-layer read-then-write can't guarantee
-- that. Single SECURITY DEFINER PL/pgSQL function, same pattern as
-- issue_credit() (20260805097): the server's service-role client calls it as
-- a plain RPC and the whole update happens inside one Postgres transaction.
--
-- p_cash_tendered is accepted for call-site symmetry with the cashier change-
-- due UI but is not persisted - transactions has no tendered/change column.
--
-- Rollup rule (mirrors add_booking_payment()): net = total_price -
-- discount_amount - promo_amount; paid = sum(total_amount) over this
-- booking's non-Pending booking_payment transactions.

create or replace function public.settle_transaction(
  p_transaction_id uuid,
  p_payment_method public.payment_method,
  p_bank_name text,
  p_payment_reference text,
  p_cash_tendered numeric,
  p_processed_by uuid
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn public.transactions;
  v_booking public.bookings;
  v_net numeric(10, 2);
  v_paid numeric(10, 2);
  v_new_status public.payment_status;
begin
  select * into v_txn
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'settle_transaction: transaction % not found', p_transaction_id;
  end if;

  if v_txn.payment_status = 'Fully Paid' then
    raise exception 'settle_transaction: transaction % is already Fully Paid', p_transaction_id;
  end if;

  update public.transactions
  set payment_status = 'Fully Paid',
      payment_method = p_payment_method,
      bank_name = p_bank_name,
      payment_reference = coalesce(p_payment_reference, payment_reference),
      processed_by_staff_id = p_processed_by,
      updated_at = now()
  where id = p_transaction_id
  returning * into v_txn;

  if v_txn.booking_id is null then
    raise exception 'settle_transaction: transaction % has no booking to roll up', p_transaction_id;
  end if;

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

revoke all on function public.settle_transaction(uuid, public.payment_method, text, text, numeric, uuid) from public;
grant execute on function public.settle_transaction(uuid, public.payment_method, text, text, numeric, uuid) to service_role;
