-- Recovery: on a provisioned database every active base service - and every
-- service type - should have an is_available = true row for every branch.
-- That's the "disable is opt-out, not opt-in" model both
-- service_branch_availability (20260715032) and
-- service_type_branch_availability (20260818133) use, and what the
-- m13-maintenance seed's seedServiceBranchAvailability() sets up.
--
-- WHY THIS MIGRATION: the m13 seed only runs on `supabase db reset`, never on
-- `supabase db push`. So on an environment that is kept up to date with
-- `db push`, a service added to the catalog by a *later* migration - notably
-- the single fixed-price Hotel service "Overnight Stay (Aircon Room)"
-- (20260807105, id ...-024) - can end up with NO service_branch_availability
-- rows at all. listServices({ branchId }) treats "no row" as "not offered
-- here" and drops the service entirely, which shows up in the customer
-- booking flow as "No Hotel services available at this branch" even though
-- the service row exists and is_active. (Same failure mode is latent for
-- every other category whenever the availability tables are out of step with
-- the catalog.)
--
-- FIX: backfill the missing rows idempotently. ON CONFLICT preserves every
-- existing row, including any deliberate is_available = false opt-out a
-- branch has set. Inactive (soft-disabled) services are skipped - they don't
-- need availability rows.
--
-- Harmless no-op on a fresh `supabase db reset`: migrations run before the
-- m01 seed creates branches, so both cross joins produce zero rows and the
-- seeds then populate everything as normal. This migration only does work on
-- an already-provisioned database whose branches already exist.

insert into public.service_branch_availability (service_id, branch_id, is_available)
select s.id, b.id, true
from public.services as s
cross join public.branches as b
where s.is_active = true
on conflict (service_id, branch_id) do nothing;

insert into public.service_type_branch_availability (service_type_id, branch_id, is_available)
select st.id, b.id, true
from public.service_types as st
cross join public.branches as b
on conflict (service_type_id, branch_id) do nothing;
