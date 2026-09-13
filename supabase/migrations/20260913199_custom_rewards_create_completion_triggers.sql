-- Custom change (coupon spin wheel, session 86): grants a spin credit
-- whenever a customer's running completed-bookings count crosses a
-- multiple of spin_wheel_config.bookings_milestone_interval (a REPEATING
-- milestone - every Nth completed booking, indefinitely, never one-time),
-- and separately whenever a single transaction is fully paid for at least
-- spin_wheel_config.spend_threshold_amount.
--
-- Trigger-based rather than a call added into every "mark
-- Completed"/"mark Fully Paid" call site: booking completion is set
-- independently from several service files (booking.service.ts,
-- daycareBilling.service.ts, hotel/services/checkout.service.ts,
-- careLogCompletion.service.ts) and a DB trigger can't be missed by a new
-- one added later.

create or replace function public.trg_increment_booking_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config    public.spin_wheel_config;
  v_new_count integer;
begin
  select * into v_config from public.spin_wheel_config limit 1;

  insert into public.customer_booking_milestone_progress (customer_id)
  values (new.customer_id)
  on conflict (customer_id) do nothing;

  update public.customer_booking_milestone_progress
  set completed_bookings_count = completed_bookings_count + 1,
      updated_at = now()
  where customer_id = new.customer_id
  returning completed_bookings_count into v_new_count;

  if v_new_count % v_config.bookings_milestone_interval = 0 then
    insert into public.customer_spin_credits (customer_id, source, source_booking_id)
    values (new.customer_id, 'booking_milestone', new.id);
  end if;

  return new;
end;
$$;

create trigger bookings_completed_milestone
  after update of status on public.bookings
  for each row
  when (new.status = 'Completed' and old.status is distinct from 'Completed')
  execute function public.trg_increment_booking_milestone();

-- Needs to fire on INSERT too (a cash sale can insert already-'Fully
-- Paid'), not just UPDATE - but Postgres forbids an INSERT trigger's WHEN
-- clause from referencing OLD at all (even combined with UPDATE in one
-- trigger, and even though OLD is conceptually NULL on INSERT) - SQLSTATE
-- 42P17. So this is two separate triggers on the same function instead of
-- one INSERT-OR-UPDATE trigger: the INSERT one has no OLD comparison to
-- make (a freshly inserted row can't have had a prior status), the UPDATE
-- one keeps the OLD/NEW transition check so an already-'Fully Paid' row
-- doesn't grant a second credit on every unrelated update.
create or replace function public.trg_spend_threshold_spin_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.spin_wheel_config;
begin
  select * into v_config from public.spin_wheel_config limit 1;

  if new.total_amount >= v_config.spend_threshold_amount then
    insert into public.customer_spin_credits (customer_id, source, source_transaction_id)
    values (new.customer_id, 'spend_threshold', new.id);
  end if;

  return new;
end;
$$;

create trigger transactions_spend_threshold_spin_credit_insert
  after insert on public.transactions
  for each row
  when (new.payment_status = 'Fully Paid')
  execute function public.trg_spend_threshold_spin_credit();

create trigger transactions_spend_threshold_spin_credit_update
  after update of payment_status on public.transactions
  for each row
  when (new.payment_status = 'Fully Paid'
        and old.payment_status is distinct from 'Fully Paid')
  execute function public.trg_spend_threshold_spin_credit();
