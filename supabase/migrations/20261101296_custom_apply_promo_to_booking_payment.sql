-- Custom change (promo at onsite payment): a cashier can take a promo off an
-- unpaid booking bill in the Mark as paid popup. Everything that has to move
-- with it moves here in one Postgres transaction:
--   - booking_promo_selections, the live record checkout reads
--   - bookings.promo_amount, or the rollup in settle_transaction would never
--     reach Fully Paid (its net is total_price - discount - promo)
--   - the bill's own total_amount/promo_amount, before settling, so the
--     spend-threshold spin trigger sees what was really paid
--   - transaction_promo_selections, the audit log
--
-- The reduction goes on the bill's largest existing line, not a new negative
-- 'promo' line: settle_transaction and pay_transaction_with_credit overwrite
-- every line of a partially paid bill with the amount paid, which would turn
-- a negative line into a positive one.
--
-- counterPromo.service.ts decides whether the promo is allowed. The checks
-- here are only the ones that can change between that and this call, under
-- row locks so two cashiers can't both apply one.

create or replace function public.apply_promo_to_booking_payment(
  p_transaction_id uuid,
  p_promo_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_booking public.bookings%rowtype;
  v_line public.transaction_line_items%rowtype;
begin
  if p_amount <= 0 then
    raise exception 'A promo must take something off the bill';
  end if;

  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found or v_transaction.booking_id is null then
    raise exception 'This bill cannot take a promo';
  end if;

  if v_transaction.payment_status <> 'Pending' then
    raise exception 'This bill is already paid';
  end if;

  select * into v_booking
  from public.bookings
  where id = v_transaction.booking_id
  for update;

  if v_booking.discount_amount > 0
     or v_booking.promo_amount > 0
     or exists (
       select 1 from public.booking_promo_selections
       where booking_id = v_booking.id
     )
  then
    raise exception 'This booking already has a discount or promo';
  end if;

  if exists (
    select 1 from public.transactions
    where booking_id = v_booking.id
      and transaction_type = 'booking_payment'
      and id <> p_transaction_id
  ) then
    raise exception 'A promo can only be added before any payment is made';
  end if;

  if p_amount >= v_transaction.total_amount then
    raise exception 'A promo cannot cover the whole bill';
  end if;

  select * into v_line
  from public.transaction_line_items
  where transaction_id = p_transaction_id
  order by line_total desc
  limit 1
  for update;

  if not found or v_line.line_total <= p_amount then
    raise exception 'This bill has no line large enough for the promo';
  end if;

  update public.transaction_line_items
  set line_total = line_total - p_amount,
      unit_price = round((line_total - p_amount) / quantity, 2)
  where id = v_line.id;

  update public.transactions
  set total_amount = total_amount - p_amount,
      promo_amount = promo_amount + p_amount
  where id = p_transaction_id;

  update public.bookings
  set promo_amount = promo_amount + p_amount,
      updated_at = now()
  where id = v_booking.id;

  insert into public.booking_promo_selections (
    booking_id, promo_id, applied_amount
  )
  values (v_booking.id, p_promo_id, p_amount);

  insert into public.transaction_promo_selections (
    transaction_id, promo_id, is_activated, activated_at
  )
  values (p_transaction_id, p_promo_id, true, now());

  return v_line.id;
end;
$$;

-- Undoes the above when the payment it was added for fails, so a failed
-- Mark as paid leaves the bill exactly as it was.
create or replace function public.remove_promo_from_booking_payment(
  p_transaction_id uuid,
  p_promo_id uuid,
  p_amount numeric,
  p_line_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
begin
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
    and payment_status = 'Pending'
  for update;

  if not found then
    return;
  end if;

  update public.transaction_line_items
  set line_total = line_total + p_amount,
      unit_price = round((line_total + p_amount) / quantity, 2)
  where id = p_line_id;

  update public.transactions
  set total_amount = total_amount + p_amount,
      promo_amount = promo_amount - p_amount
  where id = p_transaction_id;

  update public.bookings
  set promo_amount = promo_amount - p_amount,
      updated_at = now()
  where id = v_transaction.booking_id;

  delete from public.booking_promo_selections
  where booking_id = v_transaction.booking_id
    and promo_id = p_promo_id;

  delete from public.transaction_promo_selections
  where transaction_id = p_transaction_id
    and promo_id = p_promo_id;
end;
$$;

revoke all on function public.apply_promo_to_booking_payment(uuid, uuid, numeric) from public;
grant execute on function public.apply_promo_to_booking_payment(uuid, uuid, numeric) to service_role;

revoke all on function public.remove_promo_from_booking_payment(uuid, uuid, numeric, uuid) from public;
grant execute on function public.remove_promo_from_booking_payment(uuid, uuid, numeric, uuid) to service_role;
