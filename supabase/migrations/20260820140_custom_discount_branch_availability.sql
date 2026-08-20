-- Custom change (admin settings > discount builder): discounts become
-- many-to-many with branches, mirroring service_branch_availability
-- (20260715032), service_type_branch_availability (20260818133), and
-- package_branch_availability (20260818134) - the same migration this repo
-- already ran twice for Services/Service Types/Packages, now applied to
-- Discounts too instead of the original #39 "one branch_id column" design.
--
-- Existing rows are backfilled 1:1 from their current branch_id. A
-- same-named/same-scope discount that used to need one row per branch (see
-- module-3-maintenance.seed's own Dev Notes on the 16-row Senior Citizen/PWD
-- seed) can now be a single row available at several branches; is_active
-- stays the project-wide on/off switch, and the new per-branch
-- is_available flag is what independently gates a branch the way separate
-- rows used to - an Admin can still turn "Senior Citizen - Veterinary" off
-- at just Makati via Branch Availability without touching Southwoods.

create table public.discount_branch_availability (
  discount_id uuid not null references public.discounts(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  is_available boolean not null default true,
  primary key (discount_id, branch_id)
);

insert into public.discount_branch_availability (discount_id, branch_id, is_available)
select id, branch_id, true from public.discounts;

drop index if exists public.discounts_branch_id_idx;
alter table public.discounts drop column branch_id;

alter table public.discount_branch_availability enable row level security;

-- Same staff-only read shape as discounts itself (not the "any authenticated
-- user" policy used by package_branch_availability - discounts aren't a
-- customer-facing catalog table).
create policy "Staff can read discount branch availability"
  on public.discount_branch_availability
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage discount branch availability"
  on public.discount_branch_availability
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
