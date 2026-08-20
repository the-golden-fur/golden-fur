-- Custom change (unify active/available, "do the same for promos"): promos
-- move off the crude branch_scope enum ('makati'/'southwoods'/'both') onto
-- the same many-to-many promo_branch_availability join every other
-- multi-branch entity in this schema already uses
-- (service/service_type/package/discount_branch_availability).
--
-- Deliberately NOT touched here: promos.is_active. Unlike the other four
-- entities, a promo's is_active also drives automatic date-based expiry
-- (promoExpiry.job.ts flips it off once end_date passes) - a temporal
-- concern that has nothing to do with which branches carry the promo, so it
-- stays a separate manual+date-driven flag. Only the spatial (branch)
-- dimension is unified here.
--
-- Backfill: 'both' becomes an available row at every branch; 'makati'/
-- 'southwoods' becomes a single available row at that one branch (the other
-- branch gets no row at all, same "absence = unavailable" convention as
-- every other *_branch_availability table).

create table public.promo_branch_availability (
  promo_id uuid not null references public.promos(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  is_available boolean not null default true,
  primary key (promo_id, branch_id)
);

insert into public.promo_branch_availability (promo_id, branch_id, is_available)
select p.id, b.id, true
from public.promos as p
join public.branches as b on (
  p.branch_scope = 'both'
  or (p.branch_scope = 'makati' and lower(b.name) = 'makati')
  or (p.branch_scope = 'southwoods' and lower(b.name) = 'southwoods')
);

alter table public.promos drop column branch_scope;

alter table public.promo_branch_availability enable row level security;

-- Same staff-only read shape as promos itself (not the "any authenticated
-- user" policy used by package_branch_availability - promos aren't read
-- directly by customer-facing pages; the booking/checkout flows evaluate
-- them server-side).
create policy "Staff can read promo branch availability"
  on public.promo_branch_availability
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage promo branch availability"
  on public.promo_branch_availability
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
