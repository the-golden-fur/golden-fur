-- Epic C (#33): first RLS ever defined on this table. Append-only from the
-- UI: staff can INSERT/SELECT but there is deliberately no UPDATE/DELETE
-- policy at all, matching the "permanent annotation trail" design (also
-- enforced at the router level - pet.routes.ts exposes no PATCH/DELETE
-- route for /pets/:id/medical-notes/:noteId). Customers read-only their own
-- pets' notes via the same pets.customer_id join used for vaccination
-- records.

alter table public.pet_medical_notes enable row level security;

create policy "Staff can create medical notes"
  on public.pet_medical_notes
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Receptionist', 'Veterinarian', 'Admin', 'Supervisor', 'Superadmin'));

create policy "Staff can view medical notes"
  on public.pet_medical_notes
  for select
  to authenticated
  using (public.current_staff_role() in ('Receptionist', 'Veterinarian', 'Admin', 'Supervisor', 'Superadmin'));

create policy "Customers can view their own pets medical notes"
  on public.pet_medical_notes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.pets
      where pets.id = pet_medical_notes.pet_id
        and pets.customer_id = auth.uid()
    )
  );
