-- Architectural-Change-History "In Progress" row (Alarie): the Bookings Queue
-- New Booking flow can't book tomorrow or today. Root cause - the single
-- notice_period_days knob (default 3) was overloaded by session 59 as a
-- lead-time floor on NEW bookings, on top of its original job as the
-- reschedule/cancellation notice. The advisor wanted the 3-day rule for
-- RESCHEDULES only.
--
-- This adds a separate, independent knob for the new-online-booking notice
-- period, default 0 (same-day bookings allowed). notice_period_days is left
-- untouched and keeps gating reschedule (evaluateNoticePeriod +
-- assertMeetsNoticeLeadTime) and cancellation.
--
-- Reuses policy_configurations' default-row + per-branch-override pattern
-- (...037). Resolved by resolveEffectivePolicy in staffPicker.service.ts; read
-- by bookingLeadDays()/assertMeetsBookingLeadTime() (createBooking, getDaySlots
-- with intent 'new_booking', the availability endpoint, findNextAvailableSlot).

alter table public.policy_configurations
  add column booking_notice_period_days integer not null default 0
    check (booking_notice_period_days >= 0);

comment on column public.policy_configurations.booking_notice_period_days is
  'Minimum whole days ahead of "now" (branch timezone) that a NEW online booking must be scheduled. 0 = same-day allowed. Independent of notice_period_days, which is the reschedule/cancellation notice. Resolved by resolveEffectivePolicy in staffPicker.service.ts.';
