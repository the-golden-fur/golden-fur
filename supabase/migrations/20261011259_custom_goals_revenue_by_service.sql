-- Custom change (Goals page): revenue per service. goal_period_stats()
-- (20261011258) gains one key:
--   revenue_by_category  settled booking payments per
--                        bookings.service_category - the same rule as
--                        get_branch_comparison()'s revenue_by_category
--                        (20261002240).
-- Counter (miscellaneous) sales belong to no service, so these lines add up
-- to less than the 'revenue' total whenever there were any.
--
-- Same signature, so get_goal_stats() picks it up as is. No table change -
-- the goal for a line is stored under metric_key 'revenue:<category>' in
-- the existing goal_growth_rates/goal_monthly_targets.

create or replace function public.goal_period_stats(
  p_start timestamptz,
  p_end timestamptz,
  p_branch_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'appointments', (
      select count(*)::int
      from public.bookings b
      where b.created_at >= p_start
        and b.created_at < p_end
        and (p_branch_id is null or b.branch_id = p_branch_id)
    ),
    'by_category', coalesce((
      select jsonb_object_agg(category_row.service_category, category_row.booking_count)
      from (
        select b.service_category, count(*)::int as booking_count
        from public.bookings b
        where b.created_at >= p_start
          and b.created_at < p_end
          and (p_branch_id is null or b.branch_id = p_branch_id)
        group by b.service_category
      ) category_row
    ), '{}'::jsonb),
    'revenue', coalesce((
      select sum(t.total_amount)
      from public.transactions t
      where t.payment_status = 'Fully Paid'
        and t.created_at >= p_start
        and t.created_at < p_end
        and (p_branch_id is null or t.branch_id = p_branch_id)
    ), 0)::numeric(12, 2),
    'revenue_by_category', coalesce((
      select jsonb_object_agg(category_row.service_category, category_row.amount)
      from (
        select
          b.service_category,
          sum(t.total_amount)::numeric(12, 2) as amount
        from public.transactions t
        join public.bookings b on b.id = t.booking_id
        where t.transaction_type = 'booking_payment'
          and t.payment_status = 'Fully Paid'
          and t.created_at >= p_start
          and t.created_at < p_end
          and (p_branch_id is null or t.branch_id = p_branch_id)
        group by b.service_category
      ) category_row
    ), '{}'::jsonb),
    'new_customers', (
      select count(*)::int
      from (
        select b.customer_id
        from public.bookings b
        where b.customer_id is not null
          and (p_branch_id is null or b.branch_id = p_branch_id)
        group by b.customer_id
        having min(b.created_at) >= p_start
          and min(b.created_at) < p_end
      ) first_bookings
    ),
    'packages', coalesce((
      select jsonb_object_agg(package_row.name, package_row.booking_count)
      from (
        -- `name` unqualified: the merged USING column, so a package that
        -- was booked but is no longer listed still keeps its name.
        select name, coalesce(booked.booking_count, 0) as booking_count
        from (
          select distinct btrim(p.name) as name
          from public.packages p
          where p.is_active
            and p.archived_at is null
            and (
              p_branch_id is null
              or exists (
                select 1
                from public.package_branch_availability pba
                where pba.package_id = p.id
                  and pba.branch_id = p_branch_id
                  and pba.is_available
              )
            )
        ) listed
        full join (
          select btrim(p.name) as name, count(*)::int as booking_count
          from public.booking_items bi
          join public.bookings b on b.id = bi.booking_id
          join public.packages p on p.id = bi.package_id
          where b.created_at >= p_start
            and b.created_at < p_end
            and (p_branch_id is null or b.branch_id = p_branch_id)
          group by btrim(p.name)
        ) booked using (name)
      ) package_row
    ), '{}'::jsonb)
  );
$$;
