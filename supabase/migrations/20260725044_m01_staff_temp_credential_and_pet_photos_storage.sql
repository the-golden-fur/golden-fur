-- Revision Batch 1 - Epic A (#74/#77) support migration.
--
-- #74 (resend account-created credential email): Supabase Auth never
-- retains a staff member's plaintext temporary password after creation - it
-- is generated, used once to call auth.admin.createUser, and (before this
-- batch) returned only once in the create-account response for the admin to
-- relay by hand. AC-2 requires a resend to re-deliver that *same* password,
-- not a freshly generated one, which is only possible if something durable
-- remembers it. These two columns hold it encrypted at rest (AES-256-GCM,
-- server-side key from STAFF_TEMP_CREDENTIAL_KEY - see
-- resendAccountEmail.service.ts / staffManagement.service.ts) until the
-- staff member's first successful login, at which point both are cleared
-- (staffLoginController) - a resend is only ever meaningful before that
-- point, and there is no reason to keep it around after.
alter table public.staff_profiles
  add column temp_credential_ciphertext text,
  add column temp_credential_iv text;

-- #77 (pet profile photo upload): mirrors the M01 avatars bucket pattern
-- (20260710_010_m01_avatars_storage_rls.sql) - RLS only. The `pet-photos`
-- bucket itself is created manually via the Supabase Dashboard
-- (Storage -> New bucket -> "pet-photos", public), same as `avatars` was;
-- no migration in this codebase creates a bucket programmatically.
create policy "Customers can insert their own pets' photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pet-photos'
  and exists (
    select 1 from public.pets p
    where p.id::text = (storage.foldername(name))[1]
      and p.customer_id = auth.uid()
  )
);

create policy "Customers can update their own pets' photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pet-photos'
  and exists (
    select 1 from public.pets p
    where p.id::text = (storage.foldername(name))[1]
      and p.customer_id = auth.uid()
  )
)
with check (
  bucket_id = 'pet-photos'
  and exists (
    select 1 from public.pets p
    where p.id::text = (storage.foldername(name))[1]
      and p.customer_id = auth.uid()
  )
);

create policy "Customers can delete their own pets' photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'pet-photos'
  and exists (
    select 1 from public.pets p
    where p.id::text = (storage.foldername(name))[1]
      and p.customer_id = auth.uid()
  )
);

-- Staff who can manage pets (Receptionist/Admin/Supervisor/Superadmin -
-- mirrors the "Staff can manage all pets" pets-table policy from Epic C)
-- may also upload/replace/remove a pet's photo on the owner's behalf, same
-- shape as the M01 avatars Admin/Superadmin carve-out.
create policy "Pet-managing staff can insert pet photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pet-photos'
  and public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin')
);

create policy "Pet-managing staff can update pet photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pet-photos'
  and public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin')
)
with check (
  bucket_id = 'pet-photos'
  and public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin')
);

create policy "Pet-managing staff can delete pet photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'pet-photos'
  and public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor', 'Superadmin')
);

create policy "Public can read pet photos"
on storage.objects for select
to public
using (bucket_id = 'pet-photos');
