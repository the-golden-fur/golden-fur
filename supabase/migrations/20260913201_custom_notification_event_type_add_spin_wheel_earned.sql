-- Custom change (coupon spin wheel, session 86): adds the notification
-- event fired when a customer earns a new spin credit (booking milestone or
-- spend threshold), so they see a "You earned a spin!" notification linking
-- to My Rewards.
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation already
-- used by 20260814124/20260819137/20260911189's own notification_event_type
-- additions.

alter type public.notification_event_type add value 'spin_wheel_earned';
