-- Custom change (follow-up to #34): live feedback on the just-shipped
-- per-service/package downpayment - "should we remove the branch wide
-- hotel downpayment? since it's already applied by service. instead, make
-- it so that when creating services... allow the downpayment amount to be
-- either flat PHP or percentage (of base price)."
--
-- Two changes:
--
-- 1. policy_configurations.downpayment_percentage (the Hotel-only,
--    branch-wide percentage fallback added by 20260805094) is dropped
--    entirely. It was already dead code in practice -
--    booking.service.ts/CustomerBookingFlowPage.tsx both used a separate
--    hardcoded HOTEL_DOWNPAYMENT_RATE = 0.5 constant instead of ever
--    reading this column (see that constant's own dev-note comment) - so
--    removing the column is not a behavior change to any code path, only
--    the removal of an admin-editable field (PolicyConfigurationPage) that
--    never actually did anything.
--
-- 2. services.downpayment_amount/packages.downpayment_amount (added by
--    20260808110) gain a sibling downpayment_type ('Flat' | 'Percentage')
--    - 'Flat' means downpayment_amount is a PHP figure (unchanged
--    behavior); 'Percentage' means downpayment_amount is a 0-100 percentage
--    of that item's own price_at_booking, resolved per-item in
--    booking.service.ts's createBooking (mirrors reschedule_fee_type's
--    existing 'Flat'/'Percentage' vocabulary on policy_configurations).
--
-- HOTEL_DOWNPAYMENT_RATE's Hotel-category fallback in booking.service.ts/
-- CustomerBookingFlowPage.tsx is removed in the same commit as this
-- migration - downpayment is now driven exclusively by the catalog flag.
-- To keep the seeded Hotel service's real-world behavior unchanged (it
-- previously always required a 50%-of-total downpayment), it is backfilled
-- below to requires_downpayment = true, downpayment_type = 'Percentage',
-- downpayment_amount = 50.

-- ---------------------------------------------------------------------------
-- 1. Drop the now-fully-dead branch-wide Hotel percentage
-- ---------------------------------------------------------------------------

alter table public.policy_configurations
  drop column downpayment_percentage;

-- ---------------------------------------------------------------------------
-- 2. Flat-or-percentage downpayment type on services/packages
-- ---------------------------------------------------------------------------

alter table public.services
  drop constraint services_downpayment_amount_check,
  add column downpayment_type text,
  add constraint services_downpayment_amount_check
    check (
      (requires_downpayment = false
        and downpayment_amount is null and downpayment_type is null)
      or (requires_downpayment = true
        and downpayment_amount > 0
        and downpayment_type in ('Flat', 'Percentage')
        and (downpayment_type = 'Flat' or downpayment_amount <= 100))
    );

alter table public.packages
  drop constraint packages_downpayment_amount_check,
  add column downpayment_type text,
  add constraint packages_downpayment_amount_check
    check (
      (requires_downpayment = false
        and downpayment_amount is null and downpayment_type is null)
      or (requires_downpayment = true
        and downpayment_amount > 0
        and downpayment_type in ('Flat', 'Percentage')
        and (downpayment_type = 'Flat' or downpayment_amount <= 100))
    );

comment on column public.services.downpayment_type is
  'Flat = downpayment_amount is a PHP figure; Percentage = downpayment_amount is a 0-100 percentage of this item''s own price_at_booking. NULL unless requires_downpayment is true. See resolveBookingItem in booking.service.ts.';
comment on column public.packages.downpayment_type is
  'Same convention as services.downpayment_type above.';

-- ---------------------------------------------------------------------------
-- 3. Backfill: the seeded Hotel service keeps its pre-existing 50%
--    behavior, now expressed as a normal catalog downpayment instead of
--    the removed branch-wide fallback.
-- ---------------------------------------------------------------------------

update public.services
set requires_downpayment = true,
    downpayment_type = 'Percentage',
    downpayment_amount = 50
where id = 'a1300000-0000-4000-a000-000000000024';  -- Overnight Stay (Aircon Room)
