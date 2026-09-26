-- Custom change (session 114): login tracking for the daily-login /
-- weekly-streak / monthly-streak spin triggers, and per-promo spin credits.
--
-- customer_login_days: one row per customer per Manila calendar day they
-- opened the customer portal (written only by record_customer_login(),
-- 20260925214, via the server's check-in endpoint). A day, not a login
-- event, because sessions persist - a returning customer who never types
-- their password again still "logged in" that day.
--
-- customer_spin_credits gains promo_id (which spin-wheel promo granted it,
-- and so which reward pool it spins) and period_key (the day / ISO week /
-- month a login-based credit was granted for). The partial unique index on
-- period_key makes every login grant idempotent: the same login period can
-- never grant the same promo two spins, however many times the customer
-- checks in.
--
-- promo_id stays nullable here; 20260925213 backfills it and 20260925214
-- sets NOT NULL together with the trigger rewrite.

create table public.customer_login_days (
  customer_id uuid not null references public.customer_profiles(id),
  login_date date not null,
  created_at timestamptz not null default now(),
  primary key (customer_id, login_date)
);

alter table public.customer_login_days enable row level security;

create policy "Customers can read their own login days"
  on public.customer_login_days for select to authenticated
  using (customer_id = auth.uid());
create policy "Staff can read any login days"
  on public.customer_login_days for select to authenticated
  using (public.current_staff_role() is not null);

create trigger trg_archive_deleted_row
  after delete on public.customer_login_days
  for each row execute function public.archive_deleted_row();

-- The two original CHECKs on customer_spin_credits (20260913197) were
-- declared inline without names - look them up rather than guess Postgres's
-- generated names.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.customer_spin_credits'::regclass
      and contype = 'c'
  loop
    execute format(
      'alter table public.customer_spin_credits drop constraint %I',
      r.conname
    );
  end loop;
end $$;

alter table public.customer_spin_credits
  add column promo_id uuid references public.promos(id),
  add column period_key text;

alter table public.customer_spin_credits
  add constraint customer_spin_credits_source_valid check (
    source in (
      'booking_milestone',
      'spend_threshold',
      'daily_login',
      'weekly_login_streak',
      'monthly_login_streak'
    )
  ),
  add constraint customer_spin_credits_source_refs check (
    (source = 'booking_milestone'
      and source_booking_id is not null
      and source_transaction_id is null
      and period_key is null)
    or (source = 'spend_threshold'
      and source_transaction_id is not null
      and source_booking_id is null
      and period_key is null)
    or (source in ('daily_login', 'weekly_login_streak', 'monthly_login_streak')
      and source_booking_id is null
      and source_transaction_id is null
      and period_key is not null)
  );

-- Deliberately NO unique index on (promo_id, source_booking_id) /
-- (promo_id, source_transaction_id): the booking/spend triggers already
-- only fire on the transition INTO Completed / Fully Paid (their WHEN
-- clauses, unchanged from 20260913199), and the pre-existing credit rows
-- were never constrained that way - a booking re-completed after being
-- reopened could already hold two credits, which would make 20260925213's
-- backfill (every old credit -> the one "Loyalty Spin" promo) violate such
-- an index and fail the migration on a real database.
create unique index customer_spin_credits_period_uniq
  on public.customer_spin_credits (customer_id, promo_id, source, period_key)
  where period_key is not null;

create index customer_spin_credits_customer_promo_unconsumed_idx
  on public.customer_spin_credits (customer_id, promo_id)
  where is_consumed = false;

alter table public.customer_pity_progress
  add column promo_id uuid references public.promos(id);

alter table public.spin_history
  add column promo_id uuid references public.promos(id),
  add column reward_pool_id uuid references public.reward_pools(id);
