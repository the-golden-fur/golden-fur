-- Custom change (payments-queue pet assessment capture): a per-service
-- toggle (Service Builder in AdminServicesPage) for "starting a booking on
-- this service opens a modal to record/update the pet's weight_class/
-- coat_type before advancing status" - distinct from requires_assessed_pet
-- (which gates whether an UNASSESSED pet may book the service at all).
-- Off by default for every existing service; the next migration turns it on
-- for the two services this was actually built for (Initial Assessment,
-- Reassessment).

alter table public.services
  add column captures_pet_assessment boolean not null default false;
