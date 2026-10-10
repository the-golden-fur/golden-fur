-- Custom change (vet-priced visits): adds the notification event fired when
-- a veterinarian's save puts a charge on a customer's booking - the services
-- done at a visit and/or a pharmacy medicine sale - telling the customer what
-- was charged and how much (see vetChargeNotifications.service.ts).
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation already
-- used by 20260814124/20260819137/20260911189/20260913201/20261004241's own
-- notification_event_type additions.

alter type public.notification_event_type add value 'vet_charge_posted';
