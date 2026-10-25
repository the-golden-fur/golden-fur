-- Custom change (experimental features): app-wide on/off switches a
-- Superadmin flips from Settings > Experimental. The first one archives the
-- coupon spin wheel (spins, the wheel, reward pools, reward coupons) - off by
-- default, so the feature is hidden everywhere until turned back on.
--
--   feature_flags - one row per switch. Turning a flag off never deletes
--   data: earned spins and won coupons are only paused, and come back as-is
--   when the flag is turned on again.
--
-- RLS on with no policies, same as landing_sections (20261017272): every read
-- and write goes through the Express server, which gates the write to
-- Superadmin.

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_by_staff_id uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

comment on table public.feature_flags is
  'Superadmin-controlled experimental feature switches (Settings > Experimental). Read/written only through the Express server.';

-- A settings row is schema, not seed data - same convention as
-- pricing_configuration (20260726047).
insert into public.feature_flags (key, enabled) values ('spin_wheel', false);

-- ---------------------------------------------------------------------------
-- Database kill switch for earning spins. Every grant path (booking
-- milestone, spend threshold, daily/streak login - 20260925214) asks this
-- function whether a promo is live, so adding the flag here stops all new
-- spins while the feature is off. Body copied from 20260925214 with only the
-- final feature_flags check added; create or replace keeps its grants.
-- ---------------------------------------------------------------------------

create or replace function public.spin_wheel_promo_is_live(
  p_promo_id uuid,
  p_today date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.promos p
    join public.spin_wheel_promo_settings s on s.promo_id = p.id
    join public.reward_pools rp on rp.id = s.reward_pool_id
    where p.id = p_promo_id
      and p.promo_type = 'spin_wheel'
      and p.is_active
      and p.archived_at is null
      and (p.start_date is null or p.start_date <= p_today)
      and (p.end_date is null or p.end_date >= p_today)
      and rp.is_active
      and rp.archived_at is null
      and exists (
        select 1
        from public.reward_pool_rewards m
        join public.spin_wheel_rewards r on r.id = m.spin_wheel_reward_id
        where m.reward_pool_id = rp.id
          and r.is_active
          and r.archived_at is null
      )
  )
  and exists (
    select 1
    from public.feature_flags f
    where f.key = 'spin_wheel'
      and f.enabled
  );
$$;
