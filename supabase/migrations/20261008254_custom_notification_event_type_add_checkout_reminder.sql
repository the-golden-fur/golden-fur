-- Custom change (checkout countdown notifications): adds the notification
-- event fired 15 minutes before a booked Hotel or Daycare pet's checkout
-- time, so the owner can make it in time (see stayCheckout.job.ts). The
-- existing 'daycare_overdue' event is still the "countdown complete" notice
-- at the checkout time itself, now for Hotel stays too.
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation already
-- used by 20261004241/20261007251's own notification_event_type additions.

alter type public.notification_event_type add value 'checkout_reminder';
