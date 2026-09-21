-- Customer avatar parity with staff_profiles.profile_photo_url (same
-- column name, same nullable-text shape). Staff already has a self-service
-- avatar upload; customers have never had one until this session's
-- AvatarPicker (upload or pick from a preset), which needs somewhere to
-- store the result. Populated via a dedicated POST /customers/:id/avatar
-- endpoint (uploads into the existing 'avatars' Storage bucket, or resolves
-- a known preset id) - never through the general profile PATCH, same
-- separation staff already has.

alter table public.customer_profiles
  add column profile_photo_url text;
