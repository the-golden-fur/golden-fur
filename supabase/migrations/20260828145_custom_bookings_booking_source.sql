-- Walk-in booking flow (../golden-fur-vault/Projects/golden-fur/decisions/
-- 2026-08-28-walk-in-booking-flow.md): distinguishes an 'Online' booking
-- (today's only path - customer self-service, or a receptionist booking a
-- future/same-day appointment on someone's behalf) from a new 'Walk-in'
-- path (the customer/pet is physically at the branch right now). The
-- previous proxy - created_by_staff_id IS NULL vs. not-null - only meant
-- "staff created this row on someone's behalf" and conflated walk-in,
-- phone-in, and receptionist-assisted bookings, so it can't drive the
-- down-payment-skip / status / queue-visibility behavior this needs.
--
-- Defaults to 'Online' so every existing row backfills with no behavior
-- change. Set by application code only - createBooking in
-- booking.service.ts (currently lines 702-991) is being extended
-- separately to accept booking_source, reject 'Walk-in' from a non-staff
-- requester, and skip resolveDownpaymentPolicy entirely when it's set. No
-- DB-level logic beyond the column + check constraint, and no RLS change,
-- is needed - this is an additional column, not a new access pattern.

alter table public.bookings
  add column booking_source text not null default 'Online'
    check (booking_source in ('Online', 'Walk-in'));

comment on column public.bookings.booking_source is
  'Online (default) = customer self-service or a receptionist booking a future/same-day appointment on someone''s behalf, unchanged today''s-behavior path. Walk-in = receptionist-only, customer/pet is physically at the branch right now. Set by createBooking in booking.service.ts; no DB-level logic beyond this column + check constraint.';
