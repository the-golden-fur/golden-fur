-- One-off backfill: credit money that was taken on an already-cancelled
-- booking.
--
-- WHY: nothing in the payment paths checked the booking's status, so a
-- down-payment booking swept to Cancelled by applyDownpaymentExpiry
-- (booking.service.ts - "Down payment not received before the reservation
-- deadline") still showed its Pending charges as payable, and a cashier could
-- settle them afterwards. The money was taken, the booking stayed Cancelled,
-- and no cancellation ever ran for it - so it never became credit. The
-- payment paths now refuse a Cancelled booking (transactionPayment.service.ts
-- 409); this converts what was already collected that way.
--
-- What counts: settled (payment_status <> 'Pending') booking_payment
-- transactions on a Cancelled booking whose settlement (updated_at) came
-- after the booking's cancelled_at. Full amount, no
-- cancellation_credit_conversion_rate cut - the booking was already cancelled
-- when the money was taken, so it isn't a cancellation charge.
--
-- Idempotent: a booking that already has a cancellation_logs row with credit
-- issued, or a pending manual credit review, is skipped - so is everything
-- this migration itself credits, on any re-run.
--
-- Group (multi-booking checkout) transactions carry booking_group_id, not
-- booking_id, and are deliberately not handled here - see the follow-up note
-- on splitting a shared payment per booking.

do $$
declare
  v_row record;
  v_policy record;
  v_log_id uuid;
  v_expires_at timestamptz;
begin
  for v_row in
    select
      b.id as booking_id,
      b.customer_id,
      b.branch_id,
      round(sum(t.total_amount), 2) as amount_taken
    from public.bookings b
    join public.transactions t
      on t.booking_id = b.id
     and t.transaction_type = 'booking_payment'
     and t.payment_status <> 'Pending'
     and b.cancelled_at is not null
     and t.updated_at > b.cancelled_at
    where b.status = 'Cancelled'
      and not exists (
        select 1
        from public.cancellation_logs cl
        where cl.booking_id = b.id
          and (cl.credit_issued or cl.credit_review_status = 'pending')
      )
    group by b.id, b.customer_id, b.branch_id
    having sum(t.total_amount) > 0
  loop
    -- The branch's effective policy: its own override row, else the
    -- system-default row (resolveEffectivePolicy in staffPicker.service.ts).
    select
      pc.notice_enforcement_mode,
      pc.credit_expiry_mode,
      pc.credit_expiry_days,
      pc.credit_expiry_fixed_date
    into v_policy
    from public.policy_configurations pc
    where pc.branch_id = v_row.branch_id or pc.branch_id is null
    order by pc.branch_id nulls last
    limit 1;

    -- End of the Manila calendar day, same as creditExpiry.util.ts and
    -- reapply_branch_credit_expiry (20260902160).
    v_expires_at := case v_policy.credit_expiry_mode
      when 'rolling' then
        (((now() + make_interval(days => v_policy.credit_expiry_days))
          at time zone 'Asia/Manila')::date + time '23:59:59.999')
          at time zone 'Asia/Manila'
      when 'fixed_date' then
        (v_policy.credit_expiry_fixed_date + time '23:59:59.999')
          at time zone 'Asia/Manila'
      else null
    end;

    insert into public.cancellation_logs (
      booking_id,
      customer_id,
      branch_id,
      event_type,
      notice_period_met,
      enforcement_mode_applied,
      policy_violation,
      credit_issued,
      credit_amount
    ) values (
      v_row.booking_id,
      v_row.customer_id,
      v_row.branch_id,
      'cancellation',
      true,
      v_policy.notice_enforcement_mode,
      false,
      true,
      v_row.amount_taken
    )
    returning id into v_log_id;

    perform public.issue_credit(
      v_row.customer_id,
      v_row.branch_id,
      v_row.amount_taken,
      v_log_id,
      v_expires_at
    );

    raise notice 'Credited % to customer % at branch % for cancelled booking % (paid after cancellation)',
      v_row.amount_taken, v_row.customer_id, v_row.branch_id, v_row.booking_id;
  end loop;
end;
$$;
