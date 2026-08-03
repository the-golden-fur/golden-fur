-- Multi-item bookings: a booking may now hold several services and/or
-- packages at once (customer request: "book multiple packages and
-- individual services"), replacing the old exactly-one-of
-- bookings.service_id/package_id column pair plus the Grooming-only
-- booking_addons side table. booking_items generalizes booking_addons'
-- existing "N child rows keyed by booking_id" shape to cover every category,
-- and to both services and packages.
--
-- No production data to preserve (same posture as 20260728058's status
-- unification and 20260802073's assessment-lock migrations) - this is a
-- single create -> backfill -> drop pass, not a compatibility shim.

-- ---------------------------------------------------------------------------
-- booking_items
-- ---------------------------------------------------------------------------

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  -- RESTRICT, mirroring booking_addons/package_services' rationale - an item
  -- referenced by a historical booking must never silently vanish.
  service_id uuid references public.services(id) on delete restrict,
  package_id uuid references public.packages(id) on delete restrict,
  -- Snapshot so later catalog price changes never retroactively alter
  -- historical bookings (mirrors booking_addons.price_at_booking).
  price_at_booking numeric(10, 2) not null check (price_at_booking >= 0),
  -- Snapshot of the duration this item contributed to the booking's
  -- scheduled_start/scheduled_end window at creation time (services:
  -- duration_minutes; packages: derived sum of member services'
  -- duration_minutes - see derivePackageDuration.ts). Audit/display only -
  -- scheduled_end itself stays client-supplied, same pre-existing trust
  -- boundary booking.validator.ts already documents for slot_duration_minutes.
  duration_minutes_at_booking integer not null check (duration_minutes_at_booking >= 0),
  created_at timestamptz not null default now(),
  -- Exactly one of service_id/package_id per row (mirrors bookings' own
  -- retired constraint and promo_scope's identical pattern).
  check (num_nonnulls(service_id, package_id) = 1)
);

create index booking_items_booking_id_idx on public.booking_items(booking_id);
create index booking_items_service_id_idx on public.booking_items(service_id);
create index booking_items_package_id_idx on public.booking_items(package_id);

-- Checkbox semantics, no quantity concept - a given service/package can only
-- appear once per booking.
create unique index booking_items_unique_service_idx
  on public.booking_items(booking_id, service_id) where service_id is not null;
create unique index booking_items_unique_package_idx
  on public.booking_items(booking_id, package_id) where package_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill: one booking_items row per existing bookings.service_id/
-- package_id, plus one row per existing booking_addons row.
-- ---------------------------------------------------------------------------

insert into public.booking_items
  (booking_id, service_id, package_id, price_at_booking, duration_minutes_at_booking)
select
  b.id,
  b.service_id,
  b.package_id,
  -- The addon rows already accounted for their own slice of total_price;
  -- what's left over is the "primary" service/package's own price.
  b.total_price - coalesce(
    (select sum(ba.price_at_booking) from public.booking_addons ba
     where ba.booking_id = b.id), 0
  ),
  coalesce(
    case
      when b.service_id is not null then
        (select s.duration_minutes from public.services s where s.id = b.service_id)
      when b.package_id is not null then
        (select sum(s2.duration_minutes) from public.package_services ps
         join public.services s2 on s2.id = ps.service_id
         where ps.package_id = b.package_id)
    end,
    60
  )
from public.bookings b
where b.service_id is not null or b.package_id is not null;

insert into public.booking_items
  (booking_id, service_id, price_at_booking, duration_minutes_at_booking)
select
  ba.booking_id,
  ba.service_id,
  ba.price_at_booking,
  coalesce(s.duration_minutes, 60)
from public.booking_addons ba
join public.services s on s.id = ba.service_id;

-- ---------------------------------------------------------------------------
-- Drop the superseded shape. The num_nonnulls(...) check constraint on
-- bookings was declared inline (unnamed) in 20260718035, so its
-- Postgres-assigned name isn't guaranteed - locate it by definition instead
-- of guessing bookings_check.
-- ---------------------------------------------------------------------------

drop table public.booking_addons;

do $$
declare
  target_constraint text;
begin
  select conname into target_constraint
  from pg_constraint
  where conrelid = 'public.bookings'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%num_nonnulls%';

  if target_constraint is not null then
    execute format('alter table public.bookings drop constraint %I', target_constraint);
  end if;
end;
$$;

alter table public.bookings
  drop column service_id,
  drop column package_id;

-- ---------------------------------------------------------------------------
-- RLS - mirrors booking_addons' retired policies exactly (staff read-all,
-- customer-scoped read/insert via the parent booking's ownership; staff
-- writes go through the server's service-role client, same as bookings
-- itself, so no staff write policy is declared).
-- ---------------------------------------------------------------------------

alter table public.booking_items enable row level security;

create policy "Staff can read booking items"
  on public.booking_items
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own booking items"
  on public.booking_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.customer_id = auth.uid()
    )
  );

create policy "Customers can create their own booking items"
  on public.booking_items
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.customer_id = auth.uid()
    )
  );
