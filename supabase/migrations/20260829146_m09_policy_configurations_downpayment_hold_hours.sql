-- Custom change (down-payment slot gate, follow-up to 20260828143): the
-- expiration window for an unpaid down-payment reservation. Advisor note
-- (MsMayuga-URO-Aug27 addendum A4): "Unpaid down-payment reservations need
-- an expiration window ... a same-day deadline (e.g., pay by 11:59 PM)
-- after which the reservation auto-resets and the slot becomes available
-- again."
--
-- Because a down-payment-required booking no longer holds its slot at all
-- while payment_stage = 'Unpaid' (see 20260829148's get_staff_availability
-- redefinition + capacity.service.ts), the "slot becomes available again"
-- part is already true the moment the booking is created - this timer only
-- governs when the dead Pending row is auto-cancelled and the customer
-- notified. Expressed as a plain hours count from booking creation rather
-- than a branch-local calendar deadline: no timezone math, and the slot
-- is not held during the window regardless, so "24h from creation" and
-- "end of the booking day" are operationally equivalent here. Admins can
-- widen/narrow it on the Policies page.
--
-- NOT NULL DEFAULT 24, same conditional-population-free shape as
-- credit_expiry_days (20260805094). The lazy read-time sweep that acts on
-- this lives in booking.service.ts (applyDownpaymentExpiry), mirroring
-- applyNoShowTransition - no cron infra exists in this app.

alter table public.policy_configurations
  add column downpayment_hold_hours integer not null default 24
    check (downpayment_hold_hours > 0);

comment on column public.policy_configurations.downpayment_hold_hours is
  'Hours from creation before an unpaid down-payment-required Online booking auto-cancels (status -> Cancelled, reason "down payment not received"). Resolved system-default + per-branch-override like every other policy column; snapshotted onto bookings.downpayment_due_at at creation so a later policy change never moves an existing deadline.';
