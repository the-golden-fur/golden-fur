-- Custom change (lock a consultation to the vet who took it): any
-- Veterinarian could start, edit and complete any consultation. Now the
-- first vet to act on one owns it and the others can only read it.
--
-- accepted_by is who took it; null means nobody has yet. It is its own
-- column rather than a reuse of veterinarian_id because a Veterinary
-- booking can reach 'In Progress' without any vet pressing Start (a
-- receptionist check-in, or a walk-in) - veterinarian_id is filled in from
-- the booking's auto-assigned vet the moment the row is created, so it
-- can't tell "assigned" apart from "actually took it".
--
-- Existing rows stay null: finished consultations are already read-only,
-- and an open one is claimed by whichever vet acts on it next.
--
-- consultation.service.ts's updateConsultation enforces this (the server
-- uses the service-role key), so no RLS change is needed.

alter table public.consultations
  add column accepted_by uuid references public.staff_profiles(id);

create index consultations_accepted_by_idx
  on public.consultations(accepted_by);
