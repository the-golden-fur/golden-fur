-- Custom change (vet bookable services): customers booking Veterinary pick
-- from exactly three services - Consultation (700), Follow-up Consultation
-- (0, from 20261006250) and Vaccination (450 from the base catalog, priced
-- later from Config > Services and Packages). Whatever is actually done at
-- the visit is still billed by the vet afterwards (vet_service_catalog).
--
-- 1. Adds the Consultation service.
-- 2. Deactivates the other base Veterinary services rather than archiving
--    them, so past bookings keep their service and a Superadmin can switch
--    any of them back on. listServices only returns active services and
--    resolveBookingItem rejects inactive ones, so they can't be booked.

-- ---------------------------------------------------------------------------
-- 1. Consultation service
-- ---------------------------------------------------------------------------
-- Same insert shape as the Follow-up Consultation (20261006250); a fixed id
-- + "do nothing" keeps it idempotent.

insert into public.services (id, category, name, base_price, duration_minutes)
values (
  'a1300000-0000-4000-a000-000000000031',
  'Veterinary',
  'Consultation',
  700.00,
  45
)
on conflict (id) do nothing;

-- A fresh database gets this from the m13-maintenance seed (every service
-- at every branch); this covers a database that already has branches.
insert into public.service_branch_availability (service_id, branch_id, is_available)
select 'a1300000-0000-4000-a000-000000000031', b.id, true
from public.branches b
on conflict (service_id, branch_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Deactivate the other base Veterinary services
-- ---------------------------------------------------------------------------
-- Vaccination (…017) and Follow-up Consultation (…030) stay active.

update public.services
set is_active = false,
    updated_at = now()
where id in (
  'a1300000-0000-4000-a000-000000000016', -- Wellness Exam
  'a1300000-0000-4000-a000-000000000018', -- Laboratory Test
  'a1300000-0000-4000-a000-000000000019', -- Dental Cleaning
  'a1300000-0000-4000-a000-000000000020', -- Surgery
  'a1300000-0000-4000-a000-000000000021'  -- Emergency Consultation
);
