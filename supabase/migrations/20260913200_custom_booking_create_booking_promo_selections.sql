-- Custom change (promos/coupons multiselect booking step, session 86):
-- booking-time promo/coupon selection moves from a single FK
-- (bookings.selected_promo_id / booking_groups.selected_promo_id) to a
-- one-row-per-selection table, so a customer/receptionist can pick several
-- promos and/or coupons on one booking, capped the same way the cashier's
-- checkout-time evaluatePromos already caps multiple auto-applied promos.
--
-- Those two selected_promo_id columns and their promo_amount columns are
-- left in place - promo_amount becomes the SUM across this table's rows for
-- a given booking/group, and selected_promo_id is simply no longer written
-- by new bookings (kept only so already-existing rows keep displaying).
--
-- Deliberately a NEW table rather than repurposing transaction_promo_selections:
-- that table is a checkout-time audit log keyed by transaction_id (a
-- different lifecycle/owner - it only exists once a transaction is
-- recorded); this one is the booking/booking_group-scoped "what was locked
-- in", which exists from booking creation onward, well before any
-- transaction.

create table public.booking_promo_selections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  booking_group_id uuid references public.booking_groups(id) on delete cascade,
  promo_id uuid references public.promos(id),
  customer_coupon_id uuid references public.customer_coupons(id),
  applied_amount numeric(10, 2) not null check (applied_amount >= 0),
  created_at timestamptz not null default now(),
  check (num_nonnulls(booking_id, booking_group_id) = 1),
  check (num_nonnulls(promo_id, customer_coupon_id) = 1)
);

create index booking_promo_selections_booking_id_idx
  on public.booking_promo_selections(booking_id);
create index booking_promo_selections_booking_group_id_idx
  on public.booking_promo_selections(booking_group_id);
-- A coupon can be locked into at most one booking/group, ever (belt-and-
-- suspenders alongside customer_coupons.is_redeemed).
create unique index booking_promo_selections_coupon_uniq
  on public.booking_promo_selections(customer_coupon_id)
  where customer_coupon_id is not null;

alter table public.booking_promo_selections enable row level security;

create policy "Customers can read their own booking promo selections"
  on public.booking_promo_selections for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.customer_id = auth.uid()
    )
    or exists (
      select 1 from public.booking_groups g
      where g.id = booking_group_id and g.customer_id = auth.uid()
    )
  );

create policy "Staff can read any booking promo selection"
  on public.booking_promo_selections for select to authenticated
  using (public.current_staff_role() is not null);
-- No authenticated write policy - only the server's service-role client
-- (resolveDiscountAndPromos / bookingGroup.service.ts) writes this table.

-- Widen the checkout-time audit table to also be able to record a redeemed
-- coupon (kept as its own table per the note above - this only widens what
-- it can point at).
alter table public.transaction_promo_selections
  alter column promo_id drop not null,
  add column customer_coupon_id uuid references public.customer_coupons(id);

alter table public.transaction_promo_selections
  add constraint transaction_promo_selections_one_target check (
    num_nonnulls(promo_id, customer_coupon_id) = 1
  );

create index transaction_promo_selections_coupon_id_idx
  on public.transaction_promo_selections(customer_coupon_id);
