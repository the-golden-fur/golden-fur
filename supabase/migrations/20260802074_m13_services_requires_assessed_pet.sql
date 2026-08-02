-- Companion to ...073_m02_pets_assessment_lock: an unassessed pet
-- (weight_class/coat_type both NULL) can now only book a service explicitly
-- flagged as not needing one - in practice, a single new "Initial
-- Assessment" service, seeded below. Modeled as a per-service boolean rather
-- than a hardcoded name/category check in application code, matching the
-- existing is_active flag's shape (server/src/features/maintenance -
-- maintenance.types.ts's Service interface, maintenance.validator.ts) so
-- Admin/Superadmin can toggle it from the existing service-management UI
-- without a code change if another assessment-exempt service is ever added.
--
-- Packages are deliberately never assessment-exempt (no equivalent flag on
-- public.packages) - booking.service.ts's package branch gates unconditionally
-- on the pet being assessed.
--
-- New service id follows the fixed a1300000-* id convention from
-- ...034_m13_seed_maintenance_data.sql (next unused suffix, 022) so the
-- existing service_branch_availability seed in
-- supabase/seeds/module-3-maintenance/module-3-maintenance.seed.sql - which
-- already selects every service whose id matches that prefix - picks it up
-- at both branches with no changes needed there.
--
-- base_price is a placeholder (0) - the real assessment fee is a business
-- decision for the client to set via the service-management UI, not a
-- technical one to guess here.

alter table public.services
  add column requires_assessed_pet boolean not null default true;

insert into public.services (id, category, name, base_price, duration_minutes, requires_assessed_pet)
values (
  'a1300000-0000-4000-a000-000000000022',
  'Grooming',
  'Initial Assessment',
  0.00,
  30,
  false
)
on conflict (id) do nothing;
