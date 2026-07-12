-- Epic C (#32): required fields per Modules-Features M02 Process 4 -
-- name, species, weight_class, coat_type. breed/gender/date_of_birth/
-- health_conditions are optional. weight_class and coat_type continue to be
-- the fields the Sprint 2 size-and-coat pricing matrix (M13) and future cage
-- assignment (M05) key off of.

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  name text not null,
  species public.pet_species not null,
  breed text,
  gender public.pet_gender,
  date_of_birth date,
  weight_class public.pet_weight_class not null,
  coat_type public.pet_coat_type not null,
  health_conditions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pets_customer_id_idx on public.pets(customer_id);
