-- The 'pet-photos' Storage bucket was never actually created by a migration -
-- only its RLS policies were (20260725044_m01_staff_temp_credential_and_pet_photos_storage.sql,
-- which assumed a manual Dashboard step), and 20260921206's comment that
-- 20260914203 created it is wrong (that migration only creates
-- 'service-images'). Without the bucket every pet photo upload
-- (POST /pets/:id/photo and /pets/:id/care-item-photo) fails, and the pet
-- forms swallow the failure, so no pet ever gets a photo_url. Same fix as
-- 'avatars' (20260921206) - public read (pet photos are shown on staff and
-- customer pages), writes go through the service-role server routes.
insert into storage.buckets (id, name, public)
values ('pet-photos', 'pet-photos', true)
on conflict (id) do nothing;
