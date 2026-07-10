create policy "Staff can insert avatars under their own prefix"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Staff can update avatars under their own prefix"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admins and superadmins can insert avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role in ('Admin', 'Superadmin')
  )
);

create policy "Admins and superadmins can update avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role in ('Admin', 'Superadmin')
  )
)
with check (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role in ('Admin', 'Superadmin')
  )
);

create policy "Staff can delete avatars under their own prefix"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admins and superadmins can delete avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role in ('Admin', 'Superadmin')
  )
);

create policy "Public can read avatars"
on storage.objects for select
to public
using (bucket_id = 'avatars');
