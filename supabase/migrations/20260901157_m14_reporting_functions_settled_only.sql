-- Payment/transactions model rework (feat/payment-transactions-rework), 8/8.
--
-- WHY: before the rework a booking_payment transactions row was only ever
-- written once money had actually been collected, so every reporting
-- aggregation could sum total_amount unconditionally. Now a booking_payment
-- row is created 'Pending' up front (at booking time / via
-- add_booking_payment()) and only reaches 'Fully Paid' when
-- settle_transaction() records the collection. Summing unconditionally would
-- inflate gross by every uncollected charge.
--
-- CREATE OR REPLACE of get_daily_sales_report() and get_analytics_summary()
-- from 20260805101, verbatim except every `from public.transactions t`
-- aggregation gains `and t.payment_status = 'Fully Paid'`.
-- get_cage_occupancy_report() is unchanged and intentionally not redefined
-- here.

-- ---------------------------------------------------------------------------
-- get_daily_sales_report(p_branch_id, p_report_date)
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_sales_report(
  p_branch_id uuid,
  p_report_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_breakdown jsonb;
  v_totals jsonb;
  v_credit_usage jsonb;
  v_misc_sales jsonb;
  v_misc_total numeric(10, 2);
begin
  -- service_category × payment_method breakdown - settled booking-payment
  -- transactions only, category read from the booking (bookings.service_category),
  -- not transaction_line_items (a booking's items always share one category).
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
    into v_breakdown
  from (
    select
      b.service_category,
      t.payment_method,
      count(*)::int as transaction_count,
      sum(t.total_amount)::numeric(10, 2) as gross_amount
    from public.transactions t
    join public.bookings b on b.id = t.booking_id
    where t.transaction_type = 'booking_payment'
      and t.payment_status = 'Fully Paid'
      and t.created_at::date = p_report_date
      and (p_branch_id is null or t.branch_id = p_branch_id)
    group by b.service_category, t.payment_method
    order by b.service_category, t.payment_method
  ) row_data;

  select jsonb_build_object(
    'transaction_count', coalesce(count(*), 0)::int,
    'gross_amount', coalesce(sum(t.total_amount), 0)::numeric(10, 2)
  )
    into v_totals
  from public.transactions t
  where t.transaction_type = 'booking_payment'
    and t.payment_status = 'Fully Paid'
    and t.created_at::date = p_report_date
    and (p_branch_id is null or t.branch_id = p_branch_id);

  -- Credit-usage section: credit_transactions rows of type 'redemption'
  -- (amount is stored negative for redemption per migration ...097's sign
  -- convention, so this reports the absolute value actually redeemed).
  select jsonb_build_object(
    'transaction_count', coalesce(count(*), 0)::int,
    'total_credit_applied', coalesce(sum(-ct.amount), 0)::numeric(10, 2)
  )
    into v_credit_usage
  from public.credit_transactions ct
  join public.credit_balances cb on cb.id = ct.credit_balance_id
  where ct.transaction_type = 'redemption'
    and ct.created_at::date = p_report_date
    and (p_branch_id is null or cb.branch_id = p_branch_id);

  -- Miscellaneous-sale section, broken down by payment method - kept
  -- separate from the service-category breakdown above (AC-2).
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
    into v_misc_sales
  from (
    select
      t.payment_method,
      count(*)::int as transaction_count,
      sum(t.total_amount)::numeric(10, 2) as gross_amount
    from public.transactions t
    where t.transaction_type = 'miscellaneous_sale'
      and t.payment_status = 'Fully Paid'
      and t.created_at::date = p_report_date
      and (p_branch_id is null or t.branch_id = p_branch_id)
    group by t.payment_method
    order by t.payment_method
  ) row_data;

  select coalesce(sum(t.total_amount), 0)::numeric(10, 2)
    into v_misc_total
  from public.transactions t
  where t.transaction_type = 'miscellaneous_sale'
    and t.payment_status = 'Fully Paid'
    and t.created_at::date = p_report_date
    and (p_branch_id is null or t.branch_id = p_branch_id);

  return jsonb_build_object(
    'branch_id', p_branch_id,
    'report_date', p_report_date,
    'breakdown', v_breakdown,
    'totals', v_totals,
    'credit_usage', v_credit_usage,
    'misc_sales', v_misc_sales,
    'misc_sales_total', v_misc_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_analytics_summary(p_branch_id, p_time_filter)
-- ---------------------------------------------------------------------------
create or replace function public.get_analytics_summary(
  p_branch_id uuid,
  p_time_filter text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_range_start timestamptz;
  v_revenue numeric(10, 2);
  v_booking_count int;
  v_cancelled_count int;
begin
  v_range_start := case p_time_filter
    when 'today' then date_trunc('day', now())
    when 'this_week' then date_trunc('week', now())
    when 'this_month' then date_trunc('month', now())
    when 'this_year' then date_trunc('year', now())
    when 'all_time' then '-infinity'::timestamptz
    else date_trunc('day', now())
  end;

  select coalesce(sum(t.total_amount), 0)::numeric(10, 2)
    into v_revenue
  from public.transactions t
  where t.created_at >= v_range_start
    and t.payment_status = 'Fully Paid'
    and (p_branch_id is null or t.branch_id = p_branch_id);

  select
    count(*)::int,
    count(*) filter (where b.status = 'Cancelled')::int
    into v_booking_count, v_cancelled_count
  from public.bookings b
  where b.scheduled_start >= v_range_start
    and (p_branch_id is null or b.branch_id = p_branch_id);

  return jsonb_build_object(
    'branch_id', p_branch_id,
    'time_filter', p_time_filter,
    'total_revenue', v_revenue,
    'booking_count', v_booking_count,
    'cancelled_count', v_cancelled_count,
    'cancellation_rate',
      case when v_booking_count > 0
        then round((v_cancelled_count::numeric / v_booking_count) * 100, 2)
        else 0
      end
  );
end;
$$;
