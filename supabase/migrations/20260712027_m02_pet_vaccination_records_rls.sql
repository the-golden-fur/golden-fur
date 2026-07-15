-- Epic C (#33): first RLS ever defined on this table. Staff (Receptionist,
-- Veterinarian, Admin, Supervisor, Superadmin) manage-all; customers
-- read-only their own pets' records via a join through pets.customer_id.

alter table public.pet_vaccination_records enable row level security;

create policy "Staff can manage vaccination records"
  on public.pet_vaccination_records
  for all
  to authenticated
  using (public.current_staff_role() in ('Receptionist', 'Veterinarian', 'Admin', 'Supervisor', 'Superadmin'))
  with check (public.current_staff_role() in ('Receptionist', 'Veterinarian', 'Admin', 'Supervisor', 'Superadmin'));

create policy "Customers can view their own pets vaccination records"
  on public.pet_vaccination_records
  for select
  to authenticated
  using (
    exists (
      select 1 from public.pets
      where pets.id = pet_vaccination_records.pet_id
        and pets.customer_id = auth.uid()
    )
  );
