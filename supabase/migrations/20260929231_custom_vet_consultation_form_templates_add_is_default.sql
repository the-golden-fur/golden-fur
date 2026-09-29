-- Custom change: a vet can mark exactly one of their consultation form
-- templates as the default - auto-offered the first time a fresh
-- consultation (no form_responses yet) is opened, instead of the vet
-- having to remember to pick one from the "Add result from a form
-- template..." dropdown every time. Also how the fixed vitals/diagnosis
-- fields (previously hardcoded consultations.temperature/weight/heart_rate/
-- respiratory_rate/diagnosis columns) become just another template - see
-- the "General Consultation" seed row in m07-veterinary.seed.ts/.sql.
--
-- "Exactly one default" is enforced at the application layer
-- (consultationFormTemplate.service.ts clears any other default before
-- setting a new one), not by a DB constraint - a partial unique index on
-- (veterinarian_id) where is_default would work but adds complexity for a
-- low-stakes, owner-scoped table where a brief double-default (a race
-- between two concurrent requests) is a cosmetic inconvenience, not a
-- correctness problem.

alter table public.vet_consultation_form_templates
  add column is_default boolean not null default false;
