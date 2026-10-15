-- Custom change (Late booking status): a booking whose start time has passed
-- but whose customer may still show up. Sits between 'Pending' and
-- 'No-show' - a Pending booking flips to 'Late' once scheduled_start passes,
-- and only to 'No-show' after the admin-configured threshold
-- (policy_configurations.no_show_after_minutes / no_show_at_closing,
-- 20261015267). Applied lazily on read by applyLateAndNoShowTransition in
-- booking.service.ts, same as No-show always was. A Late booking is still
-- "not started": it can be started, checked in, rescheduled or cancelled and
-- still holds its slot (20261015268).
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation as
-- 20261008254's notification_event_type addition.

alter type public.booking_status add value 'Late' after 'Pending';
