-- Custom change (checked-out notification): adds the notification event
-- fired once when staff check a Hotel or Daycare pet out, so the owner gets
-- an in-app notice and an email (see careLogNotifications.service.ts's
-- sendStayCheckedOutNotification). Until now only the pre-pickup
-- 'checkout_reminder' and 'daycare_overdue' events existed.
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation as
-- 20261008254's 'checkout_reminder' addition.

alter type public.notification_event_type add value 'stay_checked_out';
