-- Custom change (session 114): per-promo settings for promo_type =
-- 'spin_wheel' - which reward pool it draws from, its pity threshold, and
-- its trigger conditions ("after every X completed bookings, daily login,
-- consecutive logins per week, consecutive logins per month").
--
-- A spin-wheel promo has no discount of its own (the rewards in its pool do),
-- so discount_type/value/scope_type become nullable - but ONLY for that type,
-- enforced by promos_spin_wheel_no_discount below. Existing CHECKs
-- (value >= 0, scope_type in (...)) already pass on NULL.
--
-- Spin-wheel promos have no promo_branch_availability rows: their booking /
-- spend / login triggers are customer-wide, not per-branch.
--
-- Trigger conditions are COLUMNS on one row rather than rows in a child
-- table: a single login_trigger column makes "some conditions should not be
-- able to be enabled at the same time" (daily login vs weekly streak vs
-- monthly streak) structurally impossible to violate, while the booking and
-- spend triggers stay freely combinable with anything.

alter table public.promos
  alter column discount_type drop not null,
  alter column value drop not null,
  alter column scope_type drop not null;

alter table public.promos
  add constraint promos_spin_wheel_no_discount check (
    (promo_type = 'spin_wheel')
      = (discount_type is null and value is null and scope_type is null)
  ),
  add constraint promos_spin_wheel_no_condition check (
    promo_type <> 'spin_wheel' or condition_note is null
  );

create table public.spin_wheel_promo_settings (
  promo_id uuid primary key references public.promos(id) on delete cascade,
  reward_pool_id uuid not null
    references public.reward_pools(id) on delete restrict,
  -- NULL = no pity. Otherwise: after this many spins in a row without
  -- landing the pool's rarest tier, the next spin is guaranteed to.
  pity_threshold integer check (pity_threshold > 0),
  -- Every Nth completed booking (lifetime count, repeating).
  booking_milestone_interval integer check (booking_milestone_interval > 0),
  -- One spin when a single transaction is fully paid for at least this much.
  spend_threshold_amount numeric(10, 2) check (spend_threshold_amount > 0),
  login_trigger text check (
    login_trigger in ('daily_login', 'weekly_login_streak', 'monthly_login_streak')
  ),
  -- N consecutive login days within the current Manila calendar week
  -- (Mon-Sun) or month. Only for the two streak triggers.
  login_streak_days integer,
  updated_at timestamptz not null default now(),
  constraint spin_wheel_promo_settings_has_trigger check (
    num_nonnulls(booking_milestone_interval, spend_threshold_amount, login_trigger) >= 1
  ),
  -- coalesce: a CHECK that evaluates to NULL passes, so a streak trigger
  -- with a NULL day count must be forced to false explicitly.
  constraint spin_wheel_promo_settings_streak_days check (
    case login_trigger
      when 'weekly_login_streak' then coalesce(login_streak_days between 1 and 7, false)
      when 'monthly_login_streak' then coalesce(login_streak_days between 1 and 31, false)
      else login_streak_days is null
    end
  )
);

create index spin_wheel_promo_settings_pool_idx
  on public.spin_wheel_promo_settings (reward_pool_id);

alter table public.spin_wheel_promo_settings enable row level security;

create policy "Staff can read spin wheel promo settings"
  on public.spin_wheel_promo_settings for select to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage spin wheel promo settings"
  on public.spin_wheel_promo_settings for all to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create trigger trg_archive_deleted_row
  after delete on public.spin_wheel_promo_settings
  for each row execute function public.archive_deleted_row();
