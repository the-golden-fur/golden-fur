-- Sprint 3 Epic A (#63): M07 veterinary clinical-record schema -
-- procedure_type enum + consultations + consultation_line_items.
--
-- Makati-only enforcement happens at write time in the consultation-creation
-- service (#66, not this epic's scope), not just as a CHECK here - a CHECK
-- constraint can't reach through bookings -> branches to read is_vet_branch,
-- so the guard mirrors Sprint 2 Epic B's application-layer Makati Veterinary
-- enforcement pattern (assertVeterinaryBranchEligibility).

create type public.procedure_type as enum (
  'Lab test',
  'Dental',
  'Vaccination',
  'Surgery',
  'Emergency',
  'Wellness Exam'
);

-- ---------------------------------------------------------------------------
-- consultations
-- ---------------------------------------------------------------------------
-- One row per Veterinary consultation. medications is jsonb, not a separate
-- table - each consultation is already a permanent, timestamped entry, so an
-- array on the row itself is sufficient and keeps current-prescription
-- derivation a simple ORDER BY completed_at DESC LIMIT 1 (no separate
-- prescription table or manual archiving step, per Modules-Features).

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id),
  -- Denormalized from booking for pet-history queries.
  pet_id uuid not null references public.pets(id),
  -- Any Veterinarian role staff member may view/edit - no per-pet
  -- assigned-vet restriction, per Modules-Features.
  veterinarian_id uuid not null references public.staff_profiles(id),
  status text not null default 'Pending'
    check (status in ('Pending', 'Ongoing', 'Completed')),
  temperature numeric,
  weight numeric,
  heart_rate numeric,
  respiratory_rate numeric,
  diagnosis text,
  -- Array of {name, dose, notes} - both administered and prescribed. Source
  -- for current-prescription derivation (read-only, computed on demand by
  -- currentPrescription.service.ts - not this epic's scope).
  medications jsonb,
  reason_for_visit text not null,
  follow_up_date date,
  -- Set once the follow-up pending booking (#67, not this epic's scope) is
  -- created; do not attempt to create it inline as part of this migration or
  -- the consultation-creation service.
  follow_up_booking_id uuid references public.bookings(id),
  -- Set on status -> Completed; triggers the consultation_line_items
  -- billing handoff (#66, not this epic's scope).
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultations_pet_id_idx on public.consultations(pet_id);
create index consultations_veterinarian_id_idx
  on public.consultations(veterinarian_id);

-- ---------------------------------------------------------------------------
-- consultation_line_items
-- ---------------------------------------------------------------------------
-- amount is stored even though M08 doesn't exist yet - per Modules-Features
-- (Second Cut, Slides 7-8), medications and lab/procedure fees are vet
-- revenue that must eventually appear in the M14 DSR; leaving amount out now
-- would silently lose that data before Sprint 5/6 ever gets to consume it.

create table public.consultation_line_items (
  id uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE - line items have no meaning outside their parent
  -- consultation.
  consultation_id uuid not null
    references public.consultations(id) on delete cascade,
  -- Plain text tag, not procedure_type - professional_fee and medication
  -- rows aren't procedures.
  item_type text not null
    check (item_type in ('professional_fee', 'medication', 'procedure')),
  -- Set only when item_type = 'procedure'.
  procedure_type public.procedure_type,
  description text not null,
  amount numeric(10, 2) not null,
  check (item_type = 'procedure' or procedure_type is null)
);

create index consultation_line_items_consultation_id_idx
  on public.consultation_line_items(consultation_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Any authenticated Veterinarian may SELECT/INSERT/UPDATE any consultations
-- row (no per-pet assigned-vet restriction, matching the explicit
-- Modules-Features carve-out); Admin/Supervisor/Superadmin may SELECT all;
-- Receptionist may SELECT (for pet-history / follow-up visibility in the
-- Receptionist Bookings Queue) but not INSERT/UPDATE clinical fields.
-- consultation_line_items mirrors the parent row's read access and is
-- written only by the server's service-role client (consultation.service.ts,
-- #66, not this epic's scope) on status -> Completed.

alter table public.consultations enable row level security;
alter table public.consultation_line_items enable row level security;

create policy "Veterinarians can read all consultations"
  on public.consultations
  for select
  to authenticated
  using (public.current_staff_role() = 'Veterinarian');

create policy "Veterinarians can create consultations"
  on public.consultations
  for insert
  to authenticated
  with check (public.current_staff_role() = 'Veterinarian');

create policy "Veterinarians can update consultations"
  on public.consultations
  for update
  to authenticated
  using (public.current_staff_role() = 'Veterinarian')
  with check (public.current_staff_role() = 'Veterinarian');

create policy "Admins, supervisors, and superadmins can read all consultations"
  on public.consultations
  for select
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin'));

create policy "Receptionists can read all consultations"
  on public.consultations
  for select
  to authenticated
  using (public.current_staff_role() = 'Receptionist');

create policy "Veterinarians can read all consultation line items"
  on public.consultation_line_items
  for select
  to authenticated
  using (public.current_staff_role() = 'Veterinarian');

create policy "Admins, supervisors, and superadmins can read all consultation line items"
  on public.consultation_line_items
  for select
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin'));

create policy "Receptionists can read all consultation line items"
  on public.consultation_line_items
  for select
  to authenticated
  using (public.current_staff_role() = 'Receptionist');
