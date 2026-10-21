-- Custom change (Superadmin Goals page): the Superadmin homepage goal widget
-- was a fixed "last month + 10%" computed in the browser. Goals are now
-- configurable and have their own page (Supervisor > Goals), which can look
-- at any month and at one branch or every branch together.
--
-- A goal for a metric in a month is, in order:
--   1. the exact target typed for that month (goal_monthly_targets), else
--   2. the previous month's actual + that metric's growth %
--      (goal_growth_rates), else
--   3. the previous month's actual + 10% (the default, in goals.service.ts).
--
-- metric_key is free text rather than an enum because the package goals are
-- one per package name - a package added later needs no migration:
--   appointments | revenue | new_customers
--   service:<bookings.service_category>
--   package:<packages.name>
--
-- branch_id null = the "All branches" goal. A branch's own goal is a
-- separate row and never changes the all-branches one.

-- ---------------------------------------------------------------------------
-- goal_growth_rates
-- ---------------------------------------------------------------------------

create table public.goal_growth_rates (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null check (char_length(metric_key) between 1 and 200),
  branch_id uuid references public.branches(id) on delete cascade,
  -- Percent over the previous month: 10 = +10%.
  growth_rate numeric(6, 2) not null check (growth_rate between 0 and 1000),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- nulls not distinct: only one all-branches (branch_id null) row per metric.
  constraint goal_growth_rates_metric_branch_key
    unique nulls not distinct (metric_key, branch_id)
);

create trigger trg_archive_deleted_row
  after delete on public.goal_growth_rates
  for each row execute function public.archive_deleted_row();

-- RLS on with no policies: only the Express server's service-role client
-- reads or writes this (Superadmin-only /reports/goals endpoints), same as
-- faq_items.
alter table public.goal_growth_rates enable row level security;

-- ---------------------------------------------------------------------------
-- goal_monthly_targets
-- ---------------------------------------------------------------------------

create table public.goal_monthly_targets (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null check (char_length(metric_key) between 1 and 200),
  branch_id uuid references public.branches(id) on delete cascade,
  -- Always the first day of the month the target is for.
  target_month date not null
    check (target_month = date_trunc('month', target_month)::date),
  target_value numeric(12, 2) not null check (target_value >= 0),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_monthly_targets_metric_branch_month_key
    unique nulls not distinct (metric_key, branch_id, target_month)
);

create trigger trg_archive_deleted_row
  after delete on public.goal_monthly_targets
  for each row execute function public.archive_deleted_row();

alter table public.goal_monthly_targets enable row level security;

-- ---------------------------------------------------------------------------
-- goal_period_stats(p_start, p_end, p_branch_id)
-- ---------------------------------------------------------------------------
-- The actual figures for one period [p_start, p_end). p_branch_id null =
-- every branch.
--   appointments   bookings created in the period (any status - a goal on
--                  appointments *booked*, same as the old homepage widget)
--   by_category    the same, per bookings.service_category
--   revenue        settled transactions (payment_status = 'Fully Paid'),
--                  same rule as get_analytics_summary()/get_branch_comparison()
--   new_customers  customers whose first-ever booking (at that branch, when
--                  one is given) was created in the period
--   packages       booking_items carrying a package, per package name.
--                  Every active package is listed, at 0 when nobody booked
--                  it - for one branch, the packages available there
--                  (package_branch_availability).

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

-- ---------------------------------------------------------------------------
-- get_goal_stats(p_month, p_branch_id)
-- ---------------------------------------------------------------------------
-- The selected month and the one before it, side by side. Months are
-- calendar months in Manila time, where both branches are.

create or replace function public.get_goal_stats(
  p_month date,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_previous_start timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  v_previous_start :=
    (v_month - interval '1 month')::timestamp at time zone 'Asia/Manila';
  v_start := v_month::timestamp at time zone 'Asia/Manila';
  v_end := (v_month + interval '1 month')::timestamp at time zone 'Asia/Manila';

  return jsonb_build_object(
    'current', public.goal_period_stats(v_start, v_end, p_branch_id),
    'previous', public.goal_period_stats(v_previous_start, v_start, p_branch_id)
  );
end;
$$;
