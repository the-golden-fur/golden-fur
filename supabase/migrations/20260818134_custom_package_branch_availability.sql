-- Custom change: packages become many-to-many with branches, mirroring
-- service_branch_availability (20260715032) and
-- service_type_branch_availability (20260818133), rather than the original
-- MA22 "a package is exactly one branch's row" design (see
-- 20260715032_m13_create_maintenance_schema.sql's own comment on
-- public.packages). The same-named package at Makati and Southwoods no
-- longer has to be two separate rows - one row can now be available at
-- either or both branches.
--
-- Existing rows are backfilled 1:1 from their current branch_id (no attempt
-- to merge pre-existing duplicate same-named packages here - that's seed/
-- test data, not user data, and safely merging it would mean remapping
-- booking_items/discounts/promo_scope foreign keys off of rows that only
-- exist to be discarded; a reset + reseed of a local database is the
-- intended fix there, paired with this migration's seed-script update).

create table public.package_branch_availability (
  package_id uuid not null references public.packages(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  is_available boolean not null default true,
  primary key (package_id, branch_id)
);

insert into public.package_branch_availability (package_id, branch_id, is_available)
select id, branch_id, true from public.packages;

alter table public.packages drop column branch_id;

alter table public.package_branch_availability enable row level security;

-- Same open-read shape as service_type_branch_availability (booking flow
-- needs this for every authenticated user, not just staff).
create policy "Any authenticated user can read package branch availability"
  on public.package_branch_availability
  for select
  to authenticated
  using (true);

create policy "Admins and superadmins can manage package branch availability"
  on public.package_branch_availability
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
