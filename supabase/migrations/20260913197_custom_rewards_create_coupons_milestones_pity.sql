-- Custom change (coupon spin wheel, session 86): per-customer running state
-- backing the two spin-credit triggers (next migration) plus the pity
-- counter and the issued coupons themselves.
--
-- No authenticated-role write policy on any of these four tables - only the
-- service-role client (the spin_wheel() RPC, the completion triggers in the
-- next migration, and resolveDiscountAndPromos redeeming a coupon at
-- booking time) ever writes them, mirroring credit_balances/
-- credit_transactions' own "reads are policy-gated, writes go through a
-- SECURITY DEFINER function" shape.

create table public.customer_booking_milestone_progress (
  customer_id uuid primary key references public.customer_profiles(id),
  completed_bookings_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.customer_pity_progress (
  customer_id uuid primary key references public.customer_profiles(id),
  spins_since_last_pity_win integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Ledger of granted-but-not-yet-spun spin credits. Each row is a single
-- spin grant, consumed exactly once by the spin_wheel() RPC.
create table public.customer_spin_credits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  source text not null check (source in ('booking_milestone', 'spend_threshold')),
  source_booking_id uuid references public.bookings(id),
  source_transaction_id uuid references public.transactions(id),
  is_consumed boolean not null default false,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (source = 'booking_milestone' and source_booking_id is not null and source_transaction_id is null)
    or (source = 'spend_threshold' and source_transaction_id is not null and source_booking_id is null)
  )
);

create index customer_spin_credits_customer_unconsumed_idx
  on public.customer_spin_credits(customer_id)
  where is_consumed = false;

create table public.customer_coupons (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  spin_wheel_reward_id uuid references public.spin_wheel_rewards(id),
  -- Snapshotted at issuance so a later reward-catalog edit never changes an
  -- already-issued coupon's value.
  discount_type public.discount_type not null,
  value numeric(10, 2) not null check (value >= 0),
  is_redeemed boolean not null default false,
  redeemed_at timestamptz,
  redeemed_by_booking_id uuid references public.bookings(id),
  redeemed_by_booking_group_id uuid references public.booking_groups(id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (is_redeemed and redeemed_at is not null)
    or (not is_redeemed and redeemed_at is null
        and redeemed_by_booking_id is null and redeemed_by_booking_group_id is null)
  ),
  check (num_nonnulls(redeemed_by_booking_id, redeemed_by_booking_group_id) <= 1)
);

create index customer_coupons_customer_unredeemed_idx
  on public.customer_coupons(customer_id)
  where is_redeemed = false;

alter table public.customer_booking_milestone_progress enable row level security;
alter table public.customer_pity_progress enable row level security;
alter table public.customer_spin_credits enable row level security;
alter table public.customer_coupons enable row level security;

create policy "Customers can read their own milestone progress"
  on public.customer_booking_milestone_progress for select to authenticated
  using (customer_id = auth.uid());
create policy "Staff can read any milestone progress"
  on public.customer_booking_milestone_progress for select to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own pity progress"
  on public.customer_pity_progress for select to authenticated
  using (customer_id = auth.uid());
create policy "Staff can read any pity progress"
  on public.customer_pity_progress for select to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own spin credits"
  on public.customer_spin_credits for select to authenticated
  using (customer_id = auth.uid());
create policy "Staff can read any spin credits"
  on public.customer_spin_credits for select to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own coupons"
  on public.customer_coupons for select to authenticated
  using (customer_id = auth.uid());
create policy "Staff can read any coupon"
  on public.customer_coupons for select to authenticated
  using (public.current_staff_role() is not null);
