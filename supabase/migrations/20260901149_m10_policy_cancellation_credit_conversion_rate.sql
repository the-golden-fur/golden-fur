-- Advisor addendum (MsMayuga-Aug27, "Cancellations & Credits" #10): a
-- cancellation currently always converts the full payment into account
-- credit, with no way to keep part of it as a cancellation charge. Adds a
-- configurable conversion rate to policy_configurations.
--
-- Percentage (0-100) of the amount the customer ACTUALLY paid that becomes
-- account credit on a qualifying cancellation. Default 100 = full
-- conversion, so behaviour is unchanged until an Admin lowers it (e.g. 50).
--
-- Same default-row + per-branch-override + resolveEffectivePolicy() shape as
-- every other policy_configurations column. NOT NULL with a default, like
-- credit_expiry_days (20260805094) - the check is the DB-level guard here,
-- with a matching z.number().min(0).max(100) at the validator layer
-- (booking.validator.ts's updatePolicyValidator).
--
-- The NOT NULL DEFAULT backfills the already-seeded system-default row and
-- any existing branch-override rows to 100 automatically - no data change.

alter table public.policy_configurations
  add column cancellation_credit_conversion_rate numeric(5, 2) not null default 100
    check (cancellation_credit_conversion_rate >= 0
       and cancellation_credit_conversion_rate <= 100);

comment on column public.policy_configurations.cancellation_credit_conversion_rate is
  'Percentage (0-100) of the amount a customer actually paid that is converted to account credit when a qualifying booking is cancelled. Default 100 (full). Resolved by resolveEffectivePolicy in staffPicker.service.ts, applied in cancellation.service.ts.';
