-- Custom change (drop Facebook login): Facebook sign-in was never
-- provisioned and has been removed from the app, so the database no longer
-- needs to track it. This removes customer_profiles.facebook_id and the
-- 'facebook' value of the auth_provider enum.
--
-- Postgres cannot drop a single enum value, so the type is recreated with
-- the remaining values and the column is switched over to it.
--
-- Any customer whose primary sign-in method was Facebook falls back to
-- 'email' (they can set a password through the reset flow).

update public.customer_profiles
set primary_auth_provider = 'email'
where primary_auth_provider = 'facebook';

-- Also drops the column's UNIQUE constraint.
alter table public.customer_profiles drop column facebook_id;

alter table public.customer_profiles
  alter column primary_auth_provider drop default;

alter type public.auth_provider rename to auth_provider_old;

create type public.auth_provider as enum (
  'email',
  'google'
);

alter table public.customer_profiles
  alter column primary_auth_provider type public.auth_provider
  using primary_auth_provider::text::public.auth_provider;

alter table public.customer_profiles
  alter column primary_auth_provider
  set default 'email'::public.auth_provider;

drop type public.auth_provider_old;
