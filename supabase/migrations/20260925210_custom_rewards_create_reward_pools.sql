-- Custom change (session 114): "I also want to be able to create multiple
-- reward pools, and assign trigger conditions to them (ex: monthly login
-- triggers a reward pool that consists of only rare rewards)."
--
-- A reward pool is a named set of spin_wheel_rewards. One reward can sit in
-- any number of pools; each spin-wheel promo (20260925211) draws from
-- exactly one pool. Chance-of-landing is computed per pool from the member
-- rewards' weights (20260925209), never stored.
--
-- Same deactivate-then-archive shape as every other admin catalog
-- (is_active + archived_at, 20260731071/072).

create table public.reward_pools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references public.staff_profiles(id),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index reward_pools_name_live_uniq
  on public.reward_pools (lower(name))
  where archived_at is null;

create table public.reward_pool_rewards (
  reward_pool_id uuid not null
    references public.reward_pools(id) on delete cascade,
  spin_wheel_reward_id uuid not null
    references public.spin_wheel_rewards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reward_pool_id, spin_wheel_reward_id)
);

create index reward_pool_rewards_reward_idx
  on public.reward_pool_rewards (spin_wheel_reward_id);

alter table public.reward_pools enable row level security;
alter table public.reward_pool_rewards enable row level security;

-- Staff-only reads: customers never read pools directly - the per-promo
-- wheel endpoint (server, service role) returns the pool's rewards with
-- their computed chances.
create policy "Staff can read reward pools"
  on public.reward_pools for select to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage reward pools"
  on public.reward_pools for all to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Staff can read reward pool members"
  on public.reward_pool_rewards for select to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage reward pool members"
  on public.reward_pool_rewards for all to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

-- Universal deleted-records archive (20260913202 convention).
create trigger trg_archive_deleted_row
  after delete on public.reward_pools
  for each row execute function public.archive_deleted_row();

create trigger trg_archive_deleted_row
  after delete on public.reward_pool_rewards
  for each row execute function public.archive_deleted_row();
