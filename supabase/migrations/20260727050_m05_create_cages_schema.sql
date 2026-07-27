-- Sprint 4 Epic A (#71): M05 cage inventory schema - cage_size / cage_status
-- enums and the cages table.
--
-- Numbering note: the Guide assumed Sprint 3's last migration was ...028;
-- the actual last merged migration on dev is 20260726049, so this epic's
-- migrations are renumbered 050-053, matching how #61 (Sprint 3) already
-- renumbered against the same kind of drift.

-- ---------------------------------------------------------------------------
-- cage_size / cage_status enums
-- ---------------------------------------------------------------------------
-- cage_size intentionally redeclares S/M/L/XL rather than reusing
-- pets.weight_class - a cage's size category and a pet's weight class are
-- conceptually distinct fields on different tables that happen to share
-- allowed values (Design notes).

create type public.cage_size as enum ('S', 'M', 'L', 'XL');

create type public.cage_status as enum (
  'Available',
  'Occupied',
  'Reserved',
  'Under Maintenance'
);

-- ---------------------------------------------------------------------------
-- cages
-- ---------------------------------------------------------------------------
-- Individual cage unit, per-branch inventory. cage_label is free text (e.g.
-- 'M-S-03') - the system does not enforce a naming scheme.

create table public.cages (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  cage_label text not null,
  size public.cage_size not null,
  status public.cage_status not null default 'Available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cages_branch_size_status_idx
  on public.cages(branch_id, size, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Receptionist/Admin/Supervisor/Superadmin may SELECT all cages at their own
-- branch; Superadmin unrestricted. Only Admin/Superadmin may UPDATE status
-- (the Under Maintenance toggle, #78) via this policy - the Occupied/
-- Available transitions driven by check-in/checkout (#75, #78) go through
-- the server's service-role client, bypassing RLS entirely, so they are not
-- gated by this (or any) user-facing policy.

alter table public.cages enable row level security;

create policy "Staff can read cages at their branch"
  on public.cages
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Admins can update cage status at their branch"
  on public.cages
  for update
  to authenticated
  using (
    public.current_staff_role() = 'Admin'
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  )
  with check (
    public.current_staff_role() = 'Admin'
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Superadmins can manage all cages"
  on public.cages
  for all
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');
