-- Lets staff apply a discount (senior/PWD/custom) and/or a promo directly at
-- booking creation, instead of only at cashier checkout (M08). The selection
-- is locked in here so checkout (buildCheckoutPreview in
-- checkoutAggregation.service.ts) can render it as-is rather than
-- re-evaluating scope-matching discounts/promos from scratch and risking a
-- different outcome than what the customer was shown at booking time.
--
-- total_price keeps its existing meaning (pre-discount sum of booking_items)
-- so no consumer of that column needs to change - discount_amount/
-- promo_amount are the new, separate "how much was taken off" snapshots.

alter table public.bookings
  add column selected_discount_id uuid references public.discounts(id),
  add column selected_promo_id uuid references public.promos(id),
  add column discount_amount numeric(10, 2) not null default 0
    check (discount_amount >= 0),
  add column promo_amount numeric(10, 2) not null default 0
    check (promo_amount >= 0);
