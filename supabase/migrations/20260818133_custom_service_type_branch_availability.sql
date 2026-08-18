-- Custom change: per-branch availability for service types (Grooming/Hotel/
-- Daycare/Veterinary), mirroring service_branch_availability
-- (20260715032) so a branch can be taken off a service type (e.g.
-- Southwoods not offering Veterinary) the same way it already can for an
-- individual service. Replaces the row-level Activate/Deactivate action on
-- the admin Service Types page - is_active stays a real column (still what
-- the booking flow's service-type list ultimately reads) but is no longer
-- settable from that page; per-branch availability is the operative control
-- now, same precedent as the Services admin page's own actions-menu revision.

create table public.service_type_branch_availability (
  service_type_id uuid not null references public.service_types(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  is_available boolean not null default true,
  primary key (service_type_id, branch_id)
);

-- Seed: every existing service type starts available at every existing
-- branch, same "disable is opt-out, not opt-in" default as
-- service_branch_availability's own seeding convention (services.service.ts
-- createService).
insert into public.service_type_branch_availability (service_type_id, branch_id)
select service_types.id, branches.id
from public.service_types
cross join public.branches;

alter table public.service_type_branch_availability enable row level security;

-- Same open-read shape as service_types itself (booking flow needs this for
-- every authenticated user, not just staff).
create policy "Any authenticated user can read service type branch availability"
  on public.service_type_branch_availability
  for select
  to authenticated
  using (true);

create policy "Admins and superadmins can manage service type branch availability"
  on public.service_type_branch_availability
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
