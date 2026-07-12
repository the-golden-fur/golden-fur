-- Epic C (#33): pet_vaccination_records exists only as bare schema before
-- this epic (Modules-Overview: "Merged (schema) - Sprint 1 / Populated
-- Sprint 3"). Built now, ahead of that documented population date, so a
-- receptionist can record a walk-in's existing vaccination history at
-- intake (Modules-Features M02 Process 5) without waiting on M07 (Sprint 3).
-- administered_by is nullable: may be entered by a receptionist on behalf
-- of a vet, or later directly by a vet per M07.

create table public.pet_vaccination_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  vaccine_name text not null,
  date_administered date not null,
  next_due_date date,
  administered_by uuid references public.staff_profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create index pet_vaccination_records_pet_id_idx on public.pet_vaccination_records(pet_id);
