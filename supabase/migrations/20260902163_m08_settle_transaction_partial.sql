-- Architectural-Change-History "In Progress" row (Matthew): "if remaining
-- balance isn't fully paid, it creates another remaining balance transaction
-- instance" - and the follow-up in chat: this must also apply to a 'full'
-- charge that gets underpaid.
--
-- Until now settle_transaction() (20260901153) only ever flipped a Pending row
-- straight to 'Fully Paid' for its whole total_amount. This version takes an
-- optional p_amount_applied (the amount actually collected). When it is less
-- than the transaction's total:
--   1. the settled row (and its line item) is shrunk to the amount collected,
--   2. it is flipped 'Fully Paid' with the real payment details,
--   3. a NEW Pending 'booking_payment' row (payment_choice 'balance', line item
--      "Remaining balance") is created for the leftover.
-- Each spawned 'balance' row is itself settleable the same way, so "keep paying
-- until it's covered" needs no extra logic. p_amount_applied = null keeps the
-- old behaviour (settle for the full total) so existing callers are untouched.
--
-- Assumes one transaction_line_items row per booking_payment transaction - true
-- for every creation path (create_initial_booking_charge, add_booking_payment,
-- customerBookingPayment). The line-item shrink keeps the documented
-- SUM(line_total) = total_amount convention.
--
-- Booking rollup rule unchanged: net = total_price - discount - promo;
-- paid = sum(total_amount) over this booking's non-Pending booking_payment
-- rows. The shrunk row now contributes v_applied; the leftover is Pending
-- (excluded), so the booking lands 'Partially Paid' (or 'Fully Paid' if this
-- payment completed the net).
--
-- Based verbatim on 20260901153_m08_settle_transaction_rpc.sql.
--
-- The new trailing parameter changes the function's argument list, so the old
-- 6-arg version is dropped first (CREATE OR REPLACE cannot change a signature -
-- it would leave a stale overload that a 6-arg call still resolves to). The
-- only caller is transactionPayment.service.ts, updated in the same change to
-- always pass p_amount_applied.

drop function if exists public.settle_transaction(
  uuid, public.payment_method, text, text, numeric, uuid
);

create or replace function public.settle_transaction(
  p_transaction_id uuid,
  p_payment_method public.payment_method,
  p_bank_name text,
  p_payment_reference text,
  p_cash_tendered numeric,
  p_processed_by uuid,
  p_amount_applied numeric default null
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
  v_full numeric(10, 2);
  v_applied numeric(10, 2);
  v_leftover numeric(10, 2);
  v_leftover_id uuid;
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

  v_full := round(v_txn.total_amount, 2);
  v_applied := round(coalesce(p_amount_applied, v_full), 2);

  if v_applied <= 0 then
    raise exception 'settle_transaction: amount applied must be positive';
  end if;

  if v_applied > v_full + 0.001 then
    raise exception
      'settle_transaction: amount applied % exceeds transaction total %',
      v_applied, v_full;
  end if;

  v_leftover := round(v_full - v_applied, 2);

  -- Partial settlement: shrink this row + its line item to what was collected
  -- before flipping it Fully Paid, then spawn a Pending 'balance' row below.
  if v_leftover > 0 then
    update public.transactions
    set subtotal_amount = v_applied,
        total_amount = v_applied
    where id = p_transaction_id;

    update public.transaction_line_items
    set unit_price = v_applied,
        line_total = v_applied
    where transaction_id = p_transaction_id;
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

revoke all on function public.settle_transaction(uuid, public.payment_method, text, text, numeric, uuid, numeric) from public;
grant execute on function public.settle_transaction(uuid, public.payment_method, text, text, numeric, uuid, numeric) to service_role;
