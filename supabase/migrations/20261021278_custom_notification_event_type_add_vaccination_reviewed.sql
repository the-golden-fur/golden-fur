-- Custom change (customer-reported vaccinations): the notification sent to
-- a pet's owner when staff verify or reject a vaccination record they added
-- (vaccinationRecord.service.ts's reviewVaccinationRecord). One event type
-- for both outcomes - the title and message say which.
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation as
-- 20261020274's 'stay_checked_out' addition.

alter type public.notification_event_type add value 'vaccination_reviewed';
