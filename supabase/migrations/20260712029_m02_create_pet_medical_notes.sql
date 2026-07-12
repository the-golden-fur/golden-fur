-- Epic C (#33): pet_medical_notes exists only as bare schema before this
-- epic. staff_id + created_at are recorded per Process 5, forming a
-- permanent, timestamped annotation trail - no update/delete is ever
-- exposed (see ...030 RLS and pet.routes.ts, which defines no PATCH/DELETE
-- route for this resource at all).

create table public.pet_medical_notes (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  note_text text not null,
  category public.medical_note_category not null,
  staff_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create index pet_medical_notes_pet_id_idx on public.pet_medical_notes(pet_id);
