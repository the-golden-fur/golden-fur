-- Custom change (staff assignment alert): adds the 10th
-- notification_event_type value, fired when a customer explicitly selects a
-- staff member as their preferred groomer/vet for a booking
-- (staff_picker_preferences.preference_type = 'specific') - lets that staff
-- member know as soon as it happens, rather than only ever discovering it
-- from the schedule/queue.
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation already
-- used by 20260814124_custom_notification_event_type_add_message_received.sql.

alter type public.notification_event_type add value 'staff_assigned';
