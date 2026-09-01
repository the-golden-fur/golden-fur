-- Payment/transactions model rework (feat/payment-transactions-rework), 5/8.
--
-- WHY: staff need to record an additional partial payment against a booking
-- (e.g. collecting a balance in instalments) as a distinct, settleable
-- transaction. This creates a 'Pending' booking_payment transactions row plus
-- its single line item atomically, after validating the amount fits inside
-- the booking's outstanding balance. SECURITY DEFINER, same rationale as
-- settle_transaction() / issue_credit(): the row + line item must land
-- together, which two PostgREST round trips can't guarantee.
--
-- payment_method / payment_choice on the new row are placeholders:
-- payment_method 'Cash' (a valid enum value, overwritten by
-- settle_transaction() when the money is actually collected), payment_choice
-- 'balance'. remaining balance = net - already-settled, where net =
-- total_price - discount_amount - promo_amount and "settled" is the sum over
-- non-Pending booking_payment rows (same rule settle_transaction() rolls up
-- with).

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

  v_remaining := v_net - v_settled;

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
