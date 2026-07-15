create table if not exists public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  role public.staff_role not null,
  username text not null unique,
  registered_email text not null unique,
  display_name text not null,
  profile_photo_url text,
  phone_number text,
  emergency_contact_name text,
  emergency_contact_number text,
  preferred_communication_channel public.communication_channel,
  is_busy boolean not null default false,
  busy_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_profiles_branch_id on public.staff_profiles(branch_id);
create index if not exists idx_staff_profiles_role on public.staff_profiles(role);
