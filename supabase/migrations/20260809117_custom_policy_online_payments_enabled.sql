-- Admins/Superadmins can now enable or disable online (PayMongo) payments
-- per branch (or system-wide, via the null branch_id default row), same
-- toggle shape as the existing staff_picker_enabled_* columns on this
-- table. Read by isOnlinePaymentsEnabled() in staffPicker.service.ts and
-- exposed to the customer app via a small dedicated endpoint (customers
-- have no direct SELECT policy on this table, see 20260718037).

alter table public.policy_configurations
  add column online_payments_enabled boolean not null default true;
