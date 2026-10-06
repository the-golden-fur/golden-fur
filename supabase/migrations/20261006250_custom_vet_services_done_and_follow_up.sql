-- Custom change (vet-priced visits + follow-ups): what a veterinary visit
-- costs is decided by the vet after seeing the pet, and the vet can book the
-- pet's follow-up with a reason.
--
-- 1. A fixed, free "Follow-up Consultation" Veterinary service customers can
--    book (and the vet's Schedule follow-up form books on their behalf). Its
--    price is 0 - createBooking already treats a nothing-owed booking as
--    Fully Paid with no charge - and whatever was actually done at the visit
--    is billed afterwards (item 3).
-- 2. consultations.follow_up_reason - why the vet asked for the follow-up,
--    alongside the existing follow_up_date / follow_up_booking_id.
-- 3. vet_service_catalog - the clinic's shared list of veterinary services
--    and their usual prices (e.g. Surgery), which the completion pop-up
--    suggests from. The vet may still type any other service and price; what
--    was actually charged is stored per visit in consultation_line_items
--    (item_type 'procedure'), not here.

-- ---------------------------------------------------------------------------
-- 1. Follow-up Consultation service
-- ---------------------------------------------------------------------------
-- Same insert shape as the base catalog (20260715034); a fixed id + "do
-- nothing" keeps it idempotent. 45 minutes, like the Consultation service.

insert into public.services (id, category, name, base_price, duration_minutes)
values (
  'a1300000-0000-4000-a000-000000000030',
  'Veterinary',
  'Follow-up Consultation',
  0.00,
  45
)
on conflict (id) do nothing;

-- Every base service is available at every branch (the m13-maintenance seed
-- does this for a fresh database, where branches don't exist yet at
-- migration time and this insert simply finds none). This covers a database
-- that already has branches. Veterinary stays vet-branch-only at booking
-- time regardless (assertVeterinaryBranchEligibility).
insert into public.service_branch_availability (service_id, branch_id, is_available)
select 'a1300000-0000-4000-a000-000000000030', b.id, true
from public.branches b
on conflict (service_id, branch_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. consultations.follow_up_reason
-- ---------------------------------------------------------------------------

alter table public.consultations
  add column follow_up_reason text;

-- ---------------------------------------------------------------------------
-- 3. vet_service_catalog
-- ---------------------------------------------------------------------------
-- One clinic-wide list, like vet_medication_catalog after 20261006249: any
-- Veterinarian may read, add to, edit or remove any entry; created_by only
-- records who added it.

create table public.vet_service_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_price numeric(10, 2) not null check (default_price >= 0),
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vet_service_catalog enable row level security;

create policy "Veterinarians can read the service catalog"
  on public.vet_service_catalog
  for select
  to authenticated
  using (public.current_staff_role() = 'Veterinarian');

create policy "Veterinarians can add to the service catalog"
  on public.vet_service_catalog
  for insert
  to authenticated
  with check (public.current_staff_role() = 'Veterinarian');

create policy "Veterinarians can update the service catalog"
  on public.vet_service_catalog
  for update
  to authenticated
  using (public.current_staff_role() = 'Veterinarian')
  with check (public.current_staff_role() = 'Veterinarian');

create policy "Veterinarians can delete from the service catalog"
  on public.vet_service_catalog
  for delete
  to authenticated
  using (public.current_staff_role() = 'Veterinarian');

-- Universal deleted-records archive (20260913202): every new table attaches
-- this itself.
create trigger trg_archive_deleted_row
  after delete on public.vet_service_catalog
  for each row execute function public.archive_deleted_row();
