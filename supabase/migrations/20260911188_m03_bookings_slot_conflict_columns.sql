-- Custom change (slot-conflict notification): a still-Pending, unpaid
-- down-payment-required "pencil booking" is deliberately allowed to share a
-- date/time/staff/cage slot with other pencil bookings (SLOT_HOLD_PAID_OR_FILTER,
-- 20260829146-148) - only an actual payment claims the slot for real. These
-- two columns record when a pencil booking has just lost that race, so the
-- customer can be told to pick a new slot instead of silently discovering it
-- only when their own payment later fails.
--
-- Set by a new step in applyFirstBookingPaymentSideEffects (booking.service.ts)
-- right after a DIFFERENT booking's payment settles and re-confirms it still
-- holds its own slot: every other still-Pending/unpaid/downpayment_required
-- booking that would now fail checkCapacity() for the same
-- branch/category/overlapping window gets flagged here.
--
-- Cleared back to NULL by a successful reschedule (reschedule.service.ts) -
-- once the customer has picked a new slot (which reschedule already
-- re-validates for capacity on its own), the warning no longer applies.
--
-- The booking's own `status` is left untouched (still 'Pending') - this is a
-- "please fix this" flag, not a cancellation. No RLS change: both columns are
-- plain fields on a row customers can already read via existing bookings
-- policies.

alter table public.bookings
  add column slot_conflict_at timestamptz,
  add column conflict_notice text;

comment on column public.bookings.slot_conflict_at is
  'When another customer''s downpayment claimed this still-unpaid pencil booking''s date/time/staff/cage slot first. NULL unless the booking currently needs the customer to pick a new slot. Set by applyFirstBookingPaymentSideEffects in booking.service.ts, cleared by a successful reschedule.';

comment on column public.bookings.conflict_notice is
  'Short, customer-facing explanation shown alongside slot_conflict_at (e.g. which staff/date/time is no longer available). NULL unless slot_conflict_at is set.';
