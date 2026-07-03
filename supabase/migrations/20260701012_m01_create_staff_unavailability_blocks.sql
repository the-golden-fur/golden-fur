create table if not exists public.staff_unavailability_blocks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_unavailability_blocks_staff_id on public.staff_unavailability_blocks(staff_id);
create index if not exists idx_staff_unavailability_blocks_created_by on public.staff_unavailability_blocks(created_by);
create index if not exists idx_staff_unavailability_blocks_time_range on public.staff_unavailability_blocks(start_time, end_time);
