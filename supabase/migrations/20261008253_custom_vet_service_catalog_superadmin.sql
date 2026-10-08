-- Custom change (Config > Veterinary Services): a Superadmin manages the
-- clinic's vet procedure list (vet_service_catalog, 20261006250) alongside
-- the Veterinarians who use it. The server's /veterinary/service-catalog
-- routes are the real gate (it uses the service-role key); these policies
-- just keep direct table access in step.

drop policy if exists "Veterinarians can read the service catalog"
  on public.vet_service_catalog;
drop policy if exists "Veterinarians can add to the service catalog"
  on public.vet_service_catalog;
drop policy if exists "Veterinarians can update the service catalog"
  on public.vet_service_catalog;
drop policy if exists "Veterinarians can delete from the service catalog"
  on public.vet_service_catalog;

create policy "Veterinarians and Superadmins can read the service catalog"
  on public.vet_service_catalog
  for select
  to authenticated
  using (public.current_staff_role() in ('Veterinarian', 'Superadmin'));

create policy "Veterinarians and Superadmins can add to the service catalog"
  on public.vet_service_catalog
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Veterinarian', 'Superadmin'));

create policy "Veterinarians and Superadmins can update the service catalog"
  on public.vet_service_catalog
  for update
  to authenticated
  using (public.current_staff_role() in ('Veterinarian', 'Superadmin'))
  with check (public.current_staff_role() in ('Veterinarian', 'Superadmin'));

create policy "Veterinarians and Superadmins can delete from the service catalog"
  on public.vet_service_catalog
  for delete
  to authenticated
  using (public.current_staff_role() in ('Veterinarian', 'Superadmin'));
