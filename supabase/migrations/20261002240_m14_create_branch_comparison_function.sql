-- Custom change (Superadmin Branch Comparison page): get_branch_comparison()
-- returns one row per non-archived branch so the Branch Comparison page can
-- lay every branch out side by side - Makati, Southwoods, and any branch
-- added later, with no hardcoded names.
--
-- Read/aggregation only - no new table, so no RLS policy or
-- deleted-records-archive trigger is needed. Superadmin-only restriction is
-- enforced at the application layer (branchComparison.service.ts), same as
-- get_analytics_summary(); this function trusts its caller like every other
-- reporting function.
--
-- Time-range presets and the revenue rule (payment_status = 'Fully Paid')
-- are copied verbatim from get_analytics_summary()
-- (20260901157_m14_reporting_functions_settled_only.sql), so a branch's
-- revenue here always matches the Analytics page for the same period.

-- ---------------------------------------------------------------------------
-- get_branch_comparison(p_time_filter)
-- ---------------------------------------------------------------------------
-- Per branch:
--   revenue_total             settled transactions (booking + misc sale)
--   revenue_by_category       settled booking payments per bookings.service_category
--   counter_sales             settled miscellaneous sales
--   paid_transaction_count    settled transactions (for average sale value)
--   bookings_availed_total    Completed bookings scheduled in the period
--   bookings_availed_by_category
--   new_customers             customers whose first-ever booking at that
--                             branch was created in the period

create or replace function public.get_branch_comparison(
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
  v_result jsonb;
begin
  v_range_start := case p_time_filter
    when 'today' then date_trunc('day', now())
    when 'this_week' then date_trunc('week', now())
    when 'this_month' then date_trunc('month', now())
    when 'this_year' then date_trunc('year', now())
    when 'all_time' then '-infinity'::timestamptz
    else date_trunc('day', now())
  end;

  select coalesce(jsonb_agg(row_data order by row_data.branch_name), '[]'::jsonb)
    into v_result
  from (
    select
      br.id as branch_id,
      br.name as branch_name,
      coalesce((
        select sum(t.total_amount)
        from public.transactions t
        where t.branch_id = br.id
          and t.payment_status = 'Fully Paid'
          and t.created_at >= v_range_start
      ), 0)::numeric(10, 2) as revenue_total,
      coalesce((
        select jsonb_object_agg(category_row.service_category, category_row.amount)
        from (
          select
            b.service_category,
            sum(t.total_amount)::numeric(10, 2) as amount
          from public.transactions t
          join public.bookings b on b.id = t.booking_id
          where t.branch_id = br.id
            and t.transaction_type = 'booking_payment'
            and t.payment_status = 'Fully Paid'
            and t.created_at >= v_range_start
          group by b.service_category
        ) category_row
      ), '{}'::jsonb) as revenue_by_category,
      coalesce((
        select sum(t.total_amount)
        from public.transactions t
        where t.branch_id = br.id
          and t.transaction_type = 'miscellaneous_sale'
          and t.payment_status = 'Fully Paid'
          and t.created_at >= v_range_start
      ), 0)::numeric(10, 2) as counter_sales,
      (
        select count(*)
        from public.transactions t
        where t.branch_id = br.id
          and t.payment_status = 'Fully Paid'
          and t.created_at >= v_range_start
      )::int as paid_transaction_count,
      (
        select count(*)
        from public.bookings b
        where b.branch_id = br.id
          and b.status = 'Completed'
          and b.scheduled_start >= v_range_start
      )::int as bookings_availed_total,
      coalesce((
        select jsonb_object_agg(category_row.service_category, category_row.booking_count)
        from (
          select b.service_category, count(*)::int as booking_count
          from public.bookings b
          where b.branch_id = br.id
            and b.status = 'Completed'
            and b.scheduled_start >= v_range_start
          group by b.service_category
        ) category_row
      ), '{}'::jsonb) as bookings_availed_by_category,
      (
        select count(*)
        from (
          select b.customer_id
          from public.bookings b
          where b.branch_id = br.id
          group by b.customer_id
          having min(b.created_at) >= v_range_start
        ) first_bookings
      )::int as new_customers
    from public.branches br
    where br.archived_at is null
  ) row_data;

  return v_result;
end;
$$;
