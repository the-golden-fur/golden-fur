-- Custom change: "My Catalog" broken into Medications / Prescriptions /
-- Forms. A vet's personal medication catalog (vet_medication_catalog) is
-- now just product definitions (name/type/price) - dose and frequency
-- belong to a *prescription*, not a medication, since the same medicine is
-- dosed differently for different patients/visits. This table is the
-- reusable prescription template a vet builds once (e.g. "Standard Post-
-- Surgery Recovery": Amoxicillin 250mg BID x 7 days + Meloxicam 0.1mg/kg
-- SID x 3 days) and applies in bulk from the consultation form's
-- Prescription section, instead of adding each medication one at a time
-- every visit.
--
-- `items` is jsonb, not a normalized child table - same "array on the row"
-- reasoning already used for vet_consultation_form_templates.fields and
-- consultations.medications: a prescription template's item list is
-- arbitrary-length and always read/written as a whole with its parent, so
-- a join buys nothing. Each item is a full snapshot -
-- {medication_catalog_id, name, medicine_type, dose, frequency, duration} -
-- not just a medication_catalog_id reference, so the template keeps making
-- sense even if the source vet_medication_catalog row is later renamed or
-- deleted; medication_catalog_id is kept purely as a "was this ever
-- deleted" pointer, same convention as consultations.form_responses'
-- template_id.

create table public.vet_prescription_templates (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.staff_profiles(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vet_prescription_templates_veterinarian_id_idx
  on public.vet_prescription_templates(veterinarian_id);

-- Universal deleted-records archive (20260913202 convention).
create trigger trg_archive_deleted_row
  after delete on public.vet_prescription_templates
  for each row execute function public.archive_deleted_row();

-- ---------------------------------------------------------------------------
-- RLS: same owner-scoped idiom as vet_medication_catalog/
-- vet_consultation_form_templates.
-- ---------------------------------------------------------------------------
alter table public.vet_prescription_templates enable row level security;

create policy "Veterinarians can read their own prescription templates"
  on public.vet_prescription_templates
  for select
  to authenticated
  using (auth.uid() = veterinarian_id);

create policy "Veterinarians can insert their own prescription templates"
  on public.vet_prescription_templates
  for insert
  to authenticated
  with check (
    auth.uid() = veterinarian_id
    and public.current_staff_role() = 'Veterinarian'
  );

create policy "Veterinarians can update their own prescription templates"
  on public.vet_prescription_templates
  for update
  to authenticated
  using (auth.uid() = veterinarian_id)
  with check (
    auth.uid() = veterinarian_id
    and public.current_staff_role() = 'Veterinarian'
  );

create policy "Veterinarians can delete their own prescription templates"
  on public.vet_prescription_templates
  for delete
  to authenticated
  using (auth.uid() = veterinarian_id);
