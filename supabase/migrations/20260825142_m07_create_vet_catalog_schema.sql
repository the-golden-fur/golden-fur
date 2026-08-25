-- M07 follow-up: per-veterinarian personal catalog of medications and
-- procedures they commonly use, so the consultation form's Medications/
-- Procedures rows can be picked from a saved list instead of retyped free
-- text every visit. Unlike consultations/pet_health_conditions (any
-- Veterinarian may view/edit any row), these two tables are owner-scoped -
-- each Veterinarian only ever sees and manages their own catalog, mirroring
-- staff_unavailability_blocks' auth.uid() = <owner column> RLS pattern
-- (20260701013_m01_staff_unavailability_blocks_rls.sql) rather than
-- anything else already in this feature.

create table public.vet_medication_catalog (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.staff_profiles(id) on delete cascade,
  name text not null,
  default_dose text,
  default_price numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vet_medication_catalog_veterinarian_id_idx on public.vet_medication_catalog(veterinarian_id);

create table public.vet_procedure_catalog (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.staff_profiles(id) on delete cascade,
  -- Reuses the same fixed enum consultations already pick a procedure_type
  -- from (20260719040_m07_create_veterinary_schema.sql) so a catalog entry
  -- maps onto the consultation form's dropdown without a separate mapping.
  procedure_type public.procedure_type not null,
  description text not null,
  default_price numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vet_procedure_catalog_veterinarian_id_idx on public.vet_procedure_catalog(veterinarian_id);

-- ---------------------------------------------------------------------------
-- RLS: ownership (auth.uid() = veterinarian_id) plus a role check on
-- writes (current_staff_role() = 'Veterinarian') - combines the
-- staff_unavailability_blocks ownership idiom with the pet_health_conditions
-- role-check idiom, both already established elsewhere in this codebase.
-- ---------------------------------------------------------------------------
alter table public.vet_medication_catalog enable row level security;

create policy "Veterinarians can read their own medication catalog"
  on public.vet_medication_catalog
  for select
  to authenticated
  using (auth.uid() = veterinarian_id);

create policy "Veterinarians can insert their own medication catalog"
  on public.vet_medication_catalog
  for insert
  to authenticated
  with check (
    auth.uid() = veterinarian_id
    and public.current_staff_role() = 'Veterinarian'
  );

create policy "Veterinarians can update their own medication catalog"
  on public.vet_medication_catalog
  for update
  to authenticated
  using (auth.uid() = veterinarian_id)
  with check (
    auth.uid() = veterinarian_id
    and public.current_staff_role() = 'Veterinarian'
  );

create policy "Veterinarians can delete their own medication catalog"
  on public.vet_medication_catalog
  for delete
  to authenticated
  using (auth.uid() = veterinarian_id);

alter table public.vet_procedure_catalog enable row level security;

create policy "Veterinarians can read their own procedure catalog"
  on public.vet_procedure_catalog
  for select
  to authenticated
  using (auth.uid() = veterinarian_id);

create policy "Veterinarians can insert their own procedure catalog"
  on public.vet_procedure_catalog
  for insert
  to authenticated
  with check (
    auth.uid() = veterinarian_id
    and public.current_staff_role() = 'Veterinarian'
  );

create policy "Veterinarians can update their own procedure catalog"
  on public.vet_procedure_catalog
  for update
  to authenticated
  using (auth.uid() = veterinarian_id)
  with check (
    auth.uid() = veterinarian_id
    and public.current_staff_role() = 'Veterinarian'
  );

create policy "Veterinarians can delete their own procedure catalog"
  on public.vet_procedure_catalog
  for delete
  to authenticated
  using (auth.uid() = veterinarian_id);
