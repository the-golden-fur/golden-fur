-- Custom change: My Catalog > Medications gets an icon/image, same "curated
-- Lucide icon and/or an uploaded image" pattern services/service types/
-- packages already have (20260914203_custom_service_icon_and_image_columns
-- .sql) - both columns are nullable, a medication with neither simply
-- renders with no icon/image, same as before this change.

alter table public.vet_medication_catalog add column icon text;
alter table public.vet_medication_catalog add column image_url text;

-- New Storage bucket for the uploaded images, mirroring 'service-images'
-- (20260914203) - public read (a Board/gallery card can just <img src=...>
-- the URL directly, no signed-URL plumbing), write restricted to
-- Veterinarian role. Unlike 'service-images' this bucket only ever holds
-- personal-catalog images, but Storage objects aren't linked to a specific
-- vet_medication_catalog row (same trade-off already accepted for
-- service-images: a random UUID path, no per-object ownership check, and an
-- edit that replaces an image doesn't clean up the old file).
insert into storage.buckets (id, name, public)
values ('vet-medication-images', 'vet-medication-images', true)
on conflict (id) do nothing;

create policy "Veterinarians can insert their own medication images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vet-medication-images'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role = 'Veterinarian'
  )
);

create policy "Veterinarians can update their own medication images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'vet-medication-images'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role = 'Veterinarian'
  )
)
with check (
  bucket_id = 'vet-medication-images'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role = 'Veterinarian'
  )
);

create policy "Veterinarians can delete their own medication images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'vet-medication-images'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.role = 'Veterinarian'
  )
);

create policy "Public can read vet medication images"
on storage.objects for select
to public
using (bucket_id = 'vet-medication-images');
