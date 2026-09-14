-- Custom change (slot-conflict notification): adds the 11th
-- notification_event_type value, fired at the same moment
-- bookings.slot_conflict_at is set (see 20260911188) - tells a customer that
-- another customer's downpayment just claimed the date/time/staff/cage slot
-- their own still-unpaid "pencil booking" was sharing, and that they need to
-- pick a new one.
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation already
-- used by 20260814124_custom_notification_event_type_add_message_received.sql
-- and 20260819137_custom_notification_event_type_add_staff_assigned.sql.

alter type public.notification_event_type add value 'booking_slot_conflict';
