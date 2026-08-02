-- Companion to ...074_m13_services_requires_assessed_pet.sql's "Initial
-- Assessment": a "Reassessment" service for a pet that already has an
-- assessment on file but may need re-weighing (e.g. it's grown). Unlike
-- Initial Assessment, this is NOT assessment-exempt (requires_assessed_pet
-- stays at its default true) - it's for an already-assessed pet, not a
-- substitute entry point for a brand-new one. Booking it is purely optional
-- (soft-nudge model - see ...073_m02_pets_assessment_lock.sql's header);
-- nothing about assessed_at forces it.
--
-- Same fixed-id convention as ...034/...074 - next unused suffix, 023 - so
-- the existing service_branch_availability seed
-- (supabase/seeds/module-3-maintenance/module-3-maintenance.seed.sql, which
-- already selects every service whose id matches the 'a1300000-%' prefix)
-- picks it up at both branches automatically.
--
-- base_price is a placeholder (0), same as Initial Assessment - the real
-- fee is a business decision for the client to set via the service-
-- management UI, not a technical one to guess here.

insert into public.services (id, category, name, base_price, duration_minutes, requires_assessed_pet)
values (
  'a1300000-0000-4000-a000-000000000023',
  'Grooming',
  'Reassessment',
  0.00,
  30,
  true
)
on conflict (id) do nothing;
