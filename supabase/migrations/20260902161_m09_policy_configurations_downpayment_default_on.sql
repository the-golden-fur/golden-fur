-- Architectural-Change-History "In Progress" row (Matthew): a new booking must
-- let the customer/receptionist choose downpayment vs full payment at the last
-- step. The choice UI (CustomerBookingFlowPage's Review step) already exists but
-- only renders when the branch downpayment policy is enabled, and 20260828143
-- shipped it disabled - so nobody ever sees the choice and every booking is
-- charged in full ("currently it auto locks full payment").
--
-- This flips the system-wide default to ENABLED at 50% (Percentage), the
-- advisor's own worked example (MsMayuga-Aug27). An Admin can still turn it off
-- or change the amount/type per branch on Settings > Config > Policies; a flat
-- PHP amount is a one-line edit here.
--
-- Column DEFAULT flip: future per-branch override rows inherit "enabled".
-- Existing-row UPDATE: only the seeded system-default row (branch_id IS NULL),
-- and only when its type/amount were never set - so a shared dev/staging DB
-- where an Admin already configured downpayment is left untouched.
--
-- The enabled-requires-type-and-amount invariant and the 0-100 percentage cap
-- stay at the validator layer (booking.validator.ts), matching this table's
-- reschedule_fee_* convention - no DB CHECK added here.

alter table public.policy_configurations
  alter column downpayment_enabled set default true;

update public.policy_configurations
set downpayment_enabled = true,
    downpayment_type = 'Percentage',
    downpayment_amount = 50,
    updated_at = now()
where branch_id is null
  and downpayment_type is null
  and downpayment_amount is null;

comment on column public.policy_configurations.downpayment_enabled is
  'Whether an online booking transaction requires a downpayment. Default TRUE (enabled system-wide at 50% Percentage since 20260902161); Admin can disable or override per branch. Resolved by resolveEffectivePolicy/resolveDownpaymentPolicy in staffPicker.service.ts.';
