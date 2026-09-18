-- Customer self-service deactivate/delete (Settings > Danger section).
--
-- customer_profiles already has is_active/archived_at from the Products/
-- Staff/Customers archive-workflow precedent (20260731070/071). Neither
-- column records *when* deactivation happened, which the new auto-delete
-- countdown needs, and neither distinguishes "deactivated, still has all
-- its data" from "deactivated because we scrubbed it after a hard-delete
-- hit a foreign-key wall" (see customerArchive.service.ts's
-- deleteOrAnonymizeCustomer) - hence the two new columns below instead of
-- overloading the existing ones.

alter table public.customer_profiles
  add column deactivated_at timestamptz,
  add column anonymized_at timestamptz;

-- Mirrors the credit_expiry_days precedent
-- (20260805094_..._credit_expiry.sql) - a plain admin-tunable day count on
-- the existing system-default row (branch_id is null). Customers aren't
-- branch-scoped, so this is never read per-branch.
alter table public.policy_configurations
  add column customer_deactivation_auto_delete_days integer not null default 30
    check (customer_deactivation_auto_delete_days > 0);
