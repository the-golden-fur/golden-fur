-- Custom change (Architectural-Change-History): admin > settings > config >
-- add new service type/service/package - let an admin pick an icon (a
-- curated Lucide icon name, rendered client-side - see
-- client/src/shared/components/IconPicker) and/or attach an uploaded image,
-- for all three of service_types, services, and packages. Both columns are
-- nullable/optional - existing rows and any future row created without one
-- simply render with no icon/image, same as before this change.

alter table public.service_types add column icon text;
alter table public.service_types add column image_url text;

-- Curated default icons for the five built-in service types (matched by
-- their fixed `key`, set once at creation in 20260809113/20260904171 - only
-- an admin-created custom service type has a randomUUID() key instead).
update public.service_types set icon = 'Scissors' where key = 'Grooming';
update public.service_types set icon = 'Bed' where key = 'Hotel';
update public.service_types set icon = 'PawPrint' where key = 'Daycare';
update public.service_types set icon = 'Stethoscope' where key = 'Veterinary';
update public.service_types set icon = 'ClipboardList' where key = 'Assessment';

alter table public.services add column icon text;
alter table public.services add column image_url text;

alter table public.packages add column icon text;
alter table public.packages add column image_url text;

-- New Storage bucket for the uploaded images, mirroring the 'avatars'/
-- 'pet-photos' buckets (20260710_010, 20260725044): public read (the images
-- are shown to customers on the booking flow), admin/superadmin write only.
insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do nothing;

create policy "Admins and superadmins can insert service images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'service-images'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role in ('Admin', 'Superadmin')
  )
);

create policy "Admins and superadmins can update service images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'service-images'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role in ('Admin', 'Superadmin')
  )
)
with check (
  bucket_id = 'service-images'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role in ('Admin', 'Superadmin')
  )
);

create policy "Admins and superadmins can delete service images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'service-images'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role in ('Admin', 'Superadmin')
  )
);

create policy "Public can read service images"
on storage.objects for select
to public
using (bucket_id = 'service-images');
