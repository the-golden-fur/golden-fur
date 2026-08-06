-- Renumbered 100-101 (from the Guide's original 098-099) - Sprint 5 Epic B
-- landed on dev mid-branch and took 094-099 for itself; see migration
-- 20260805100's header note for the full renumbering story.
--
-- Sprint 6 Epic A (#102, #103): M14 Report Management - get_daily_sales_report(),
-- get_cage_occupancy_report(), and get_analytics_summary(). All three are
-- read/aggregation layers over already-merged M03/M05/M08 tables - no new
-- schema, no ALTER statements against bookings/cages/transactions.
--
-- Corrects a stale "Merged" tag in Modules-Overview's DB Entities Inventory
-- for get_daily_sales_report() - no such function, or any migration that
-- would create it, exists anywhere in supabase/migrations/ before this file.
--
-- transactionHistory.service.ts (Issue #102) is deliberately NOT backed by a
-- SQL function here - it's a plain filtered Supabase query, per the Guide's
-- own dev notes ("the filtering logic doesn't need to live in the database
-- for this one").
--
-- credit-usage note: reads credit_transactions where transaction_type =
-- 'redemption', per the Guide's DB Design sheet - Sprint 5 Epic B (#88-#95,
-- credit_balances/credit_transactions/cancellation_logs) merged to dev
-- (140a0c4) while this Guide's migrations were being written, so the table
-- this section was always meant to read now actually exists. credit_balances
-- carries branch_id directly (credit is branch-locked, migration ...096), so
-- branch-scoping joins through it rather than through transactions. Note
-- billing/services/creditStub.service.ts (Epic A's checkout) still hasn't
-- been swapped to actually redeem credit at checkout (that swap is
-- explicitly out of Epic B's own scope per migration ...097's header) - so
-- this section will correctly report zero activity until that swap lands,
-- not because the query is wrong.

-- ---------------------------------------------------------------------------
-- get_daily_sales_report(p_branch_id, p_report_date)
-- ---------------------------------------------------------------------------
-- p_branch_id NULL triggers the Superadmin combined-branches view. Returns a
-- single jsonb object (not a row set) so the breakdown, credit-usage, and
-- miscellaneous-sale sections can each keep their own shape without forcing
-- a lowest-common-denominator row type across all three - the DSR UI
-- (Issue #104) renders each section independently anyway.

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
  -- service_category × payment_method breakdown - booking-payment
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
      and t.created_at::date = p_report_date
      and (p_branch_id is null or t.branch_id = p_branch_id)
    group by t.payment_method
    order by t.payment_method
  ) row_data;

  select coalesce(sum(t.total_amount), 0)::numeric(10, 2)
    into v_misc_total
  from public.transactions t
  where t.transaction_type = 'miscellaneous_sale'
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
-- get_cage_occupancy_report(p_branch_id)
-- ---------------------------------------------------------------------------
-- Real-time count grouped by size × status, reading M05's existing cages
-- table directly - no caching/materialization. p_branch_id NULL aggregates
-- across every branch (Superadmin combined view), same convention as the
-- DSR function above.

create or replace function public.get_cage_occupancy_report(
  p_branch_id uuid
)
returns table (
  size public.cage_size,
  status public.cage_status,
  cage_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select c.size, c.status, count(*) as cage_count
  from public.cages c
  where p_branch_id is null or c.branch_id = p_branch_id
  group by c.size, c.status
  order by c.size, c.status;
$$;

-- ---------------------------------------------------------------------------
-- get_analytics_summary(p_branch_id, p_time_filter)
-- ---------------------------------------------------------------------------
-- Superadmin-only per Modules-Features (enforced at the application layer -
-- analytics.service.ts, Issue #103 - not by this function, which trusts its
-- caller like every other reporting function in this file). Accepts exactly
-- the five documented filter values: today, this_week, this_month,
-- this_year, all_time. Cancellation rate uses the current five-value
-- booking_status enum (Pending/In Progress/Completed/Cancelled/No-show) -
-- 'Paid' was retired from that enum by the staff-queue-overhaul change
-- before this function was written (see Spec Tensions, Sprint6-EpicA-Guide).

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
