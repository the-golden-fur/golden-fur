-- Custom change (coupon spin wheel, session 86): singleton trigger/pity
-- config + admin-managed reward pool. Singleton pattern mirrors
-- pricing_configuration (20260726047)/promo_cap_configuration (20260726049).
--
-- Real, non-null defaults (not left blank/disabled) so the feature works out
-- of the box the moment this migration runs, in every environment - the
-- same reason promo_cap_configuration/pricing_configuration seed a working
-- default via column DEFAULT + `insert ... default values` rather than a
-- separate seed script (a singleton settings row is schema, not reference
-- data). Still a plain nullable-in-spirit toggle - an admin can raise either
-- threshold arbitrarily high via the config page to effectively disable it.

create table public.spin_wheel_config (
  id uuid primary key default gen_random_uuid(),
  bookings_milestone_interval integer not null default 5
    check (bookings_milestone_interval > 0),
  spend_threshold_amount numeric(10, 2) not null default 5000.00
    check (spend_threshold_amount >= 0),
  pity_threshold integer not null default 10 check (pity_threshold > 0),
  updated_by_staff_id uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now()
);

create unique index spin_wheel_config_singleton_uniq
  on public.spin_wheel_config((true));

insert into public.spin_wheel_config default values;

create table public.spin_wheel_rewards (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  discount_type public.discount_type not null,
  value numeric(10, 2) not null check (value >= 0),
  rarity_percent numeric(5, 2) not null
    check (rarity_percent > 0 and rarity_percent <= 100),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references public.staff_profiles(id),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The set of currently-active, non-archived rewards' rarity_percent must sum
-- to exactly 100 (or to 0, meaning the wheel is intentionally left with no
-- active rewards - a temporarily-disabled state, not an error) - checked at
-- COMMIT (deferred), not per-statement, so an admin can edit several rows'
-- percentages in one transaction without a transient false failure.
create or replace function public.check_spin_wheel_rewards_sum()
returns trigger
language plpgsql
as $$
declare
  v_sum numeric;
begin
  select coalesce(sum(rarity_percent), 0) into v_sum
  from public.spin_wheel_rewards
  where is_active and archived_at is null;

  if v_sum <> 0 and round(v_sum, 2) <> 100.00 then
    raise exception
      'Active spin wheel rewards must have rarity percentages summing to 100 (currently %)',
      v_sum;
  end if;

  return null;
end;
$$;

create constraint trigger spin_wheel_rewards_sum_check
  after insert or update or delete on public.spin_wheel_rewards
  deferrable initially deferred
  for each row
  execute function public.check_spin_wheel_rewards_sum();

alter table public.spin_wheel_config enable row level security;
alter table public.spin_wheel_rewards enable row level security;

create policy "Staff can read spin wheel config"
  on public.spin_wheel_config for select to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage spin wheel config"
  on public.spin_wheel_config for all to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

-- Customers need to read the reward pool too (the wheel UI renders every
-- active reward as a segment before/while spinning), so this is open to any
-- authenticated user, not gated to current_staff_role() like the two
-- policies above.
create policy "Anyone authenticated can read active spin wheel rewards"
  on public.spin_wheel_rewards for select to authenticated
  using (true);

create policy "Admins and superadmins can manage spin wheel rewards"
  on public.spin_wheel_rewards for all to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
