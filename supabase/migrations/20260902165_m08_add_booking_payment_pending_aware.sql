-- Architectural-Change-History "In Progress" row (Matthew): a downpayment
-- booking now starts with TWO transactions - a settled-later 'downpayment' row
-- AND a Pending 'balance' row (create_initial_booking_charge, 20260902162). The
-- old add_booking_payment() computed "remaining" as net - already-settled only,
-- and the service layer bolted on a guard rejecting any "Add a payment" while a
-- Pending charge existed. With a Pending balance row present from creation that
-- guard would block "Add a payment" forever.
--
-- Fix: net the Pending booking_payment rows too, so
--   remaining = net - sum(settled) - sum(pending)
-- and the app-side guard can be dropped - the RPC alone stops the outstanding
-- charges from ever exceeding the bill.
--
-- Signature unchanged. Based verbatim on 20260901154_m08_add_booking_payment_rpc.sql.

create or replace function public.add_booking_payment(
  p_booking_id uuid,
  p_amount numeric,
  p_processed_by uuid
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_net numeric(10, 2);
  v_settled numeric(10, 2);
  v_pending numeric(10, 2);
  v_remaining numeric(10, 2);
  v_txn public.transactions;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'add_booking_payment: amount must be positive';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'add_booking_payment: booking % not found', p_booking_id;
  end if;

  v_net := coalesce(v_booking.total_price, 0)
         - coalesce(v_booking.discount_amount, 0)
         - coalesce(v_booking.promo_amount, 0);

  select coalesce(sum(t.total_amount), 0)
    into v_settled
  from public.transactions t
  where t.booking_id = p_booking_id
    and t.transaction_type = 'booking_payment'
    and t.payment_status <> 'Pending';

  select coalesce(sum(t.total_amount), 0)
    into v_pending
  from public.transactions t
  where t.booking_id = p_booking_id
    and t.transaction_type = 'booking_payment'
    and t.payment_status = 'Pending';

  v_remaining := v_net - v_settled - v_pending;

  if p_amount > v_remaining then
    raise exception
      'add_booking_payment: amount % exceeds remaining balance %',
      p_amount, v_remaining;
  end if;

  insert into public.transactions (
    booking_id,
    customer_id,
    branch_id,
    transaction_type,
    payment_method,
    payment_status,
    payment_choice,
    subtotal_amount,
    total_amount,
    processed_by_staff_id
  ) values (
    p_booking_id,
    v_booking.customer_id,
    v_booking.branch_id,
    'booking_payment',
    'Cash',
    'Pending',
    'balance',
    p_amount,
    p_amount,
    p_processed_by
  )
  returning * into v_txn;

  insert into public.transaction_line_items (
    transaction_id,
    line_item_type,
    description,
    quantity,
    unit_price,
    line_total
  ) values (
    v_txn.id,
    'service',
    'Additional payment',
    1,
    p_amount,
    p_amount
  );

  return v_txn;
end;
$$;

revoke all on function public.add_booking_payment(uuid, numeric, uuid) from public;
grant execute on function public.add_booking_payment(uuid, numeric, uuid) to service_role;
