-- Custom change (customer-reported vaccinations): a pet's owner can add a
-- vaccination the pet already had (e.g. given at another clinic) with a
-- photo of the vaccination card. It is saved 'pending' until staff
-- (VACCINATION_MANAGER_ROLES, vaccinationRecord.service.ts) verify or reject
-- it. Records staff enter - by hand or from a consultation - stay
-- 'verified', so the column defaults to that and every existing row keeps
-- its meaning.
--
-- This is information only: nothing in booking, check-in or capacity reads
-- a vaccination's status.
--
-- Card photos go in their own PRIVATE bucket ('vaccination-proofs') - they
-- are health records and can show the owner's details, unlike the public
-- 'pet-photos' bucket. Only the server's service-role client reads or
-- writes it, handing out short-lived signed links, so it needs no storage
-- policies. proof_path is the object's path in that bucket, never a URL.
--
-- No RLS changes: every write goes through the server, and the existing
-- "Customers can view their own pets vaccination records" select policy
-- (20260712027) still covers reads. All new columns are nullable or
-- defaulted, so the temp-demo vaccination seed needs no change.

create type public.vaccination_record_status as enum (
  'verified',
  'pending',
  'rejected'
);

alter table public.pet_vaccination_records
  add column status public.vaccination_record_status not null default 'verified',
  add column reported_by_customer_id uuid
    references public.customer_profiles(id) on delete set null,
  add column proof_path text,
  add column reviewed_by_staff_id uuid references public.staff_profiles(id),
  add column reviewed_at timestamptz,
  add column rejection_reason text,
  -- A reason exactly when rejected.
  add constraint pet_vaccination_records_rejection_reason_check
    check ((status = 'rejected') = (rejection_reason is not null)),
  -- A customer's record always comes with its card photo.
  add constraint pet_vaccination_records_customer_proof_check
    check (reported_by_customer_id is null or proof_path is not null);

-- The staff review queue reads only pending rows.
create index pet_vaccination_records_pending_idx
  on public.pet_vaccination_records (created_at)
  where status = 'pending';

insert into storage.buckets (id, name, public)
values ('vaccination-proofs', 'vaccination-proofs', false)
on conflict (id) do nothing;
