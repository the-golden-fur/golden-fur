-- Custom change (#117 consultation form builder): a vet's personal, reusable
-- set of custom fields ("As a vet staff, I want to be able to record
-- anything for my consultation type services... a form builder, where the
-- vet staff can create and choose from"). Scoped per-Veterinarian, not
-- per-service - mirrors vet_medication_catalog/vet_procedure_catalog
-- (20260825142_m07_create_vet_catalog_schema.sql) exactly: each vet only
-- ever sees/manages their own templates, no shared/admin-configured set.
--
-- `fields` is jsonb, not a normalized child table - an arbitrary-length,
-- vet-defined field list is exactly what a jsonb array is for here, the
-- same reasoning the original M07 migration already gives for
-- consultations.medications (see 20260719040's header comment). Each entry
-- is {id, label, type, options?, required?} - `type` is one of
-- text/textarea/number/select/checkbox/date (validated server-side by
-- veterinary.validator.ts, not by a DB CHECK - a jsonb array's elements
-- can't be constrained by a simple Postgres CHECK without a much heavier
-- jsonb-schema expression, and this table is owner-scoped/low-stakes enough
-- not to warrant one).

create table public.vet_consultation_form_templates (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.staff_profiles(id) on delete cascade,
  name text not null,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vet_consultation_form_templates_veterinarian_id_idx
  on public.vet_consultation_form_templates(veterinarian_id);

-- Universal deleted-records archive (20260913202 convention).
create trigger trg_archive_deleted_row
  after delete on public.vet_consultation_form_templates
  for each row execute function public.archive_deleted_row();

-- ---------------------------------------------------------------------------
-- RLS: same ownership idiom as vet_medication_catalog/vet_procedure_catalog
-- (auth.uid() = veterinarian_id on every op, plus a role check on writes).
-- ---------------------------------------------------------------------------
alter table public.vet_consultation_form_templates enable row level security;

create policy "Veterinarians can read their own consultation form templates"
  on public.vet_consultation_form_templates
  for select
  to authenticated
  using (auth.uid() = veterinarian_id);

create policy "Veterinarians can insert their own consultation form templates"
  on public.vet_consultation_form_templates
  for insert
  to authenticated
  with check (
    auth.uid() = veterinarian_id
    and public.current_staff_role() = 'Veterinarian'
  );

create policy "Veterinarians can update their own consultation form templates"
  on public.vet_consultation_form_templates
  for update
  to authenticated
  using (auth.uid() = veterinarian_id)
  with check (
    auth.uid() = veterinarian_id
    and public.current_staff_role() = 'Veterinarian'
  );

create policy "Veterinarians can delete their own consultation form templates"
  on public.vet_consultation_form_templates
  for delete
  to authenticated
  using (auth.uid() = veterinarian_id);
