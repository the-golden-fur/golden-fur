-- Multi-booking checkout (booking_groups - 20260906173 / transactions.
-- booking_group_id - 20260906174 / create_initial_booking_group_charge -
-- 20260906175): settle_transaction (20260901153, partial-amount version
-- 20260902163) is the RPC the cashier's "record a payment" action
-- (transactionPayment.service.ts recordTransactionPayment) calls to flip a
-- Pending booking_payment transaction to Fully Paid. It has always assumed
-- the transaction has a `booking_id` to roll `bookings.payment_status` up
-- against, unconditionally raising otherwise - which meant settling a
-- GROUP's downpayment/balance/full transaction (booking_id NULL,
-- booking_group_id set - the only shape create_initial_booking_group_charge
-- ever produces) threw instead of settling.
--
-- Fix, deliberately NOT duplicating the booking_groups rollup + sibling-
-- bookings mirror in SQL (recomputeBookingGroupPaymentStatus,
-- booking.service.ts, already does this in one place): when the just-
-- settled row is a group transaction (booking_id is null and
-- booking_group_id is not null), this RPC now
--   1. still spawns the Pending 'balance' leftover row for a partial
--      settlement (that's just another transactions insert - no
--      bookings-table involvement either way), against the SAME group
--      (booking_id null, booking_group_id carried over) rather than a
--      booking, and
--   2. returns NULL instead of raising or touching `bookings` at all -
--      there is no single `public.bookings` row to report back for a group
--      settlement (this function's `returns public.bookings` is unchanged;
--      returning NULL is the least-disruptive option since there is no
--      SETOF/array wrapping to instead return zero rows with). The caller
--      (transactionPayment.service.ts) doesn't use this RPC's return value
--      for a group transaction anyway - it calls
--      recomputeBookingGroupPaymentStatus(booking_group_id) right after,
--      the same way it already calls applyFirstBookingPaymentSideEffects
--      after settling a single booking's transaction.
--
-- The non-group path (booking_id not null - every booking created before
-- this feature, and every non-grouped booking going forward) is preserved
-- byte-for-byte: same shrink-then-flip-then-spawn-leftover-then-roll-up
-- sequence, same SQL text, just reached via an added `elsif`-style guard
-- rather than unconditionally. The "both null" shape stays defensively
-- unreachable (the transactions_booking_id_matches_type CHECK - 20260906174 -
-- guarantees a booking_payment row always has exactly one of the two set) but
-- still raises exactly as before if it were ever reached directly.
--
-- Signature unchanged (still 7 args, same as 20260902163), so plain
-- CREATE OR REPLACE. Based verbatim on
-- 20260902163_m08_settle_transaction_partial.sql.

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

  -- Group transaction: no single `bookings` row to roll up - leave that to
  -- the JS-side recomputeBookingGroupPaymentStatus (see this migration's own
  -- header note). Still spawn the Pending leftover row, against the group.
  if v_txn.booking_id is null and v_txn.booking_group_id is not null then
    if v_leftover > 0 then
      insert into public.transactions (
        booking_id, booking_group_id, customer_id, branch_id, transaction_type,
        payment_method, payment_status, payment_choice,
        subtotal_amount, total_amount, processed_by_staff_id
      ) values (
        null, v_txn.booking_group_id, v_txn.customer_id, v_txn.branch_id, 'booking_payment',
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

    return null;
  end if;

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
