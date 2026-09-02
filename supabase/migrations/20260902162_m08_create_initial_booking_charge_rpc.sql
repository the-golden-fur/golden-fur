-- Architectural-Change-History "In Progress" row (Matthew): "choosing the
-- downpayment scheme should initially create 2 transactions (downpayment +
-- remaining balance)". Until now createBooking emitted a single Pending
-- booking_payment transaction (the down payment OR the full total, via the
-- old app-side createInitialBookingCharge). This RPC replaces that helper so
-- the down payment and its remaining-balance charge land together in one
-- Postgres transaction - same SECURITY DEFINER pattern as settle_transaction
-- (20260901153) / add_booking_payment (20260901154) / issue_credit
-- (20260805097), whose rationale is "the row + its line item must be atomic,
-- two PostgREST round trips can't guarantee that".
--
--   p_scheme = 'downpayment' -> two Pending rows:
--     1. payment_choice 'downpayment', total = round2(p_downpayment_amount),
--        line item "Down payment"
--     2. payment_choice 'balance',     total = net - downpayment  (only if > 0),
--        line item "Remaining balance"
--   p_scheme = 'full' -> one Pending row: payment_choice 'full', total = net,
--     line item "Full payment"
--
-- Both rows are Pending, so neither counts as "settled" in any rollup
-- (payment_status <> 'Pending'): the booking stays payment_status 'Pending'
-- and (when a down payment is required) holds no slot until the first row is
-- actually settled - unchanged from before. Invariant preserved: each row has
-- exactly one line item with line_total = total_amount.
--
-- payment_method 'Cash' is a placeholder (a valid enum value), overwritten by
-- settle_transaction() when the money is collected. Caller (createBooking) is
-- best-effort: it logs a failure and never rolls the booking back.

create or replace function public.create_initial_booking_charge(
  p_booking_id uuid,
  p_scheme text,
  p_net_total numeric,
  p_downpayment_amount numeric
)
returns setof public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_dp numeric(10, 2);
  v_balance numeric(10, 2);
  v_txn public.transactions;
begin
  if p_scheme not in ('downpayment', 'full') then
    raise exception 'create_initial_booking_charge: bad scheme %', p_scheme;
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'create_initial_booking_charge: booking % not found', p_booking_id;
  end if;

  if p_scheme = 'downpayment' then
    v_dp := round(coalesce(p_downpayment_amount, 0), 2);
    v_balance := round(coalesce(p_net_total, 0) - v_dp, 2);

    insert into public.transactions (
      booking_id, customer_id, branch_id, transaction_type,
      payment_method, payment_status, payment_choice,
      subtotal_amount, total_amount
    ) values (
      v_booking.id, v_booking.customer_id, v_booking.branch_id, 'booking_payment',
      'Cash', 'Pending', 'downpayment',
      v_dp, v_dp
    )
    returning * into v_txn;

    insert into public.transaction_line_items (
      transaction_id, line_item_type, description, quantity, unit_price, line_total
    ) values (v_txn.id, 'service', 'Down payment', 1, v_dp, v_dp);

    return next v_txn;

    if v_balance > 0 then
      insert into public.transactions (
        booking_id, customer_id, branch_id, transaction_type,
        payment_method, payment_status, payment_choice,
        subtotal_amount, total_amount
      ) values (
        v_booking.id, v_booking.customer_id, v_booking.branch_id, 'booking_payment',
        'Cash', 'Pending', 'balance',
        v_balance, v_balance
      )
      returning * into v_txn;

      insert into public.transaction_line_items (
        transaction_id, line_item_type, description, quantity, unit_price, line_total
      ) values (v_txn.id, 'service', 'Remaining balance', 1, v_balance, v_balance);

      return next v_txn;
    end if;
  else
    insert into public.transactions (
      booking_id, customer_id, branch_id, transaction_type,
      payment_method, payment_status, payment_choice,
      subtotal_amount, total_amount
    ) values (
      v_booking.id, v_booking.customer_id, v_booking.branch_id, 'booking_payment',
      'Cash', 'Pending', 'full',
      round(coalesce(p_net_total, 0), 2), round(coalesce(p_net_total, 0), 2)
    )
    returning * into v_txn;

    insert into public.transaction_line_items (
      transaction_id, line_item_type, description, quantity, unit_price, line_total
    ) values (
      v_txn.id, 'service', 'Full payment', 1,
      round(coalesce(p_net_total, 0), 2), round(coalesce(p_net_total, 0), 2)
    );

    return next v_txn;
  end if;
end;
$$;

revoke all on function public.create_initial_booking_charge(uuid, text, numeric, numeric) from public;
grant execute on function public.create_initial_booking_charge(uuid, text, numeric, numeric) to service_role;
