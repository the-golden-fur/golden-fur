-- The 'avatars' Storage bucket was never actually created by a migration -
-- only its RLS policies were (20260710_010_m01_avatars_storage_rls.sql),
-- which silently do nothing useful without the bucket itself existing.
-- Pre-existing gap (staff avatar upload was already broken on any
-- environment provisioned purely from migrations, e.g. a freshly reset dev
-- database), surfaced by adding the customer upload flow in this session.
-- Same migration-driven bucket creation as 'message-attachments'
-- (20260814131) and 'service-images'/'pet-photos' (20260914203) - public
-- read (avatar URLs are shown in the navbar and elsewhere), write is
-- already policy-gated to each uploader's own prefix or an Admin/Superadmin.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
