-- Custom change (cancellation grace for last-minute bookings): a booking made
-- less than notice_period_days ahead of its start can never meet the
-- cancellation notice period, so before this a paid down payment on a
-- same-day / next-day booking was always forfeited on cancel - even when the
-- customer cancelled a minute after booking. With booking_notice_period_days
-- defaulting to 0 (same-day booking allowed), that was every short-notice
-- booking.
--
-- cancellation_grace_minutes: a booking that was already inside the notice
-- window when it was made, and is cancelled within this many minutes of
-- being made, is treated as if notice was met (payment converts to credit at
-- cancellation_credit_conversion_rate). Bookings made further ahead are
-- unaffected. 0 turns the grace off (the previous behaviour). Default 60.
--
-- Reuses policy_configurations' default-row + per-branch-override pattern
-- (...037). Resolved by resolveEffectivePolicy in staffPicker.service.ts; read
-- by cancelBooking in cancellation.service.ts.

alter table public.policy_configurations
  add column cancellation_grace_minutes integer not null default 60
    check (cancellation_grace_minutes between 0 and 1440);

comment on column public.policy_configurations.cancellation_grace_minutes is
  'Minutes after a booking is made during which a booking that was made inside the cancellation notice window can still be cancelled for credit, as if notice was met. 0 = no grace. Read by cancelBooking in cancellation.service.ts.';
