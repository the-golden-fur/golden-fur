-- Revision Batch 1 - Epic A follow-up: deferred cleanup for #71/#72.
--
-- Migrations 20260725041 and 20260725042 deliberately left
-- pets.species, pets.breed, and pets.health_conditions in place
-- (superseded by pets.pet_type/breed_id and pet_health_conditions,
-- respectively) instead of dropping them immediately, so that batch
-- shipped as a non-breaking add-and-backfill change. Nothing in this
-- codebase reads these three columns anymore as of that batch.
--
-- This migration is the actual breaking step - it is intentionally NOT
-- meant to run automatically alongside the rest of the batch. Apply it
-- only once you've confirmed nothing else (another service, a report,
-- an export job, a BI tool pointed at this database, etc.) still reads
-- pets.species / pets.breed / pets.health_conditions directly.
--
-- IF EXISTS on each column: some environments had one or more of these
-- columns dropped already (e.g. applied by hand via the SQL Editor before
-- `supabase db push` ever recorded this migration as run), which otherwise
-- makes this migration fail with "column does not exist" and blocks every
-- migration after it from applying. Idempotent either way - a fresh
-- environment still gets all three columns dropped.

alter table public.pets
  drop column if exists species,
  drop column if exists breed,
  drop column if exists health_conditions;
