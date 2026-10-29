-- Custom change (Day Off Requests queue): staff notifications for the
-- day-off review loop (dayOffNotifications.service.ts).
--   day_off_requested - to the approver(s) when a staff member submits a
--                       request (the requested reviewer, or every
--                       Supervisor/Admin/Superadmin at the branch).
--   day_off_reviewed  - back to the requester once it's approved or denied.
--
-- Own migration, same reason as 20261021278: Postgres forbids using a value
-- added by ADD VALUE in the transaction that added it.

alter type public.notification_event_type add value 'day_off_requested';
alter type public.notification_event_type add value 'day_off_reviewed';
