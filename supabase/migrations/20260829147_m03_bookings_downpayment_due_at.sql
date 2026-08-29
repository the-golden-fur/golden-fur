-- Custom change (down-payment slot gate): the per-booking snapshot of the
-- unpaid-down-payment expiration deadline. Companion to 20260829146's
-- policy_configurations.downpayment_hold_hours.
--
-- Set by createBooking (booking.service.ts) ONLY when the booking is an
-- Online booking created with downpayment_required = true and
-- payment_stage = 'Unpaid' - i.e. a "pencil booking" that hasn't paid any
-- of its down payment yet. NULL for:
--   - walk-ins (booking_source = 'Walk-in' - no down payment, #122),
--   - bookings created already paid / paid-in-advance,
--   - bookings under a policy with downpayment_enabled = false.
--
-- Computed as now() + (downpayment_hold_hours || ' hours') at creation, so
-- an admin later changing the policy never retroactively moves a live
-- deadline. Once payment_stage leaves 'Unpaid' the value is irrelevant
-- (the sweep only looks at Unpaid rows) and is left as-is rather than
-- nulled.
--
-- No DB-level trigger/logic - the auto-cancel is a lazy read-time
-- transition in applyDownpaymentExpiry (booking.service.ts), same pattern
-- as applyNoShowTransition. Additional column only; no RLS change.

alter table public.bookings
  add column downpayment_due_at timestamptz;

comment on column public.bookings.downpayment_due_at is
  'When an unpaid down-payment-required Online booking auto-cancels if still unpaid. Snapshotted from policy_configurations.downpayment_hold_hours at creation. NULL for walk-ins, already-paid bookings, and bookings with no down-payment requirement. Enforced by applyDownpaymentExpiry in booking.service.ts (lazy, read-time).';
