-- Per-user "view pet weight as kg or lbs" preference - a display-only choice
-- that belongs to the individual, not the branch or an Admin toggle. Same
-- shape as ...018 (theme) / ...065 (font size): one scalar text column with a
-- NOT NULL DEFAULT + named CHECK on BOTH profile tables, so every signed-in
-- user (staff and customer) has it. The DEFAULT backfills existing rows, so
-- this applies cleanly on `db push` to an already-provisioned environment.
--
-- 'kg' is the default because the business operates in a metric market; a
-- user who prefers pounds flips it once in Settings > Preferences. This only
-- ever changes how a stored weight is *rendered* - weights are always stored
-- canonically in kilograms (see ...185_m02_pets_add_weight_kg.sql).

alter table public.staff_profiles
  add column weight_unit_preference text not null default 'kg'
    constraint staff_profiles_weight_unit_preference_check
    check (weight_unit_preference in ('kg', 'lbs'));

alter table public.customer_profiles
  add column weight_unit_preference text not null default 'kg'
    constraint customer_profiles_weight_unit_preference_check
    check (weight_unit_preference in ('kg', 'lbs'));
