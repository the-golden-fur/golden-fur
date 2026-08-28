-- Custom change: moves the downpayment toggle/config from per-catalog-item
-- (services.requires_downpayment/downpayment_amount/downpayment_type,
-- packages same - added by 20260808110/20260808112) to per-transaction -
-- one config, resolved the same default-row + per-branch-override way as
-- every other policy_configurations column, applied against the whole
-- booking's total_price at creation time instead of summed per selected
-- item. See the companion migration 20260828144 for the catalog-column
-- removal.
--
-- Same conditional-population shape as reschedule_fee_enabled/
-- reschedule_fee_type/reschedule_fee_value (20260805094): type/amount are
-- nullable and only meaningful when downpayment_enabled = true. The
-- enabled-requires-type-and-value invariant and the 0-100 cap for
-- 'Percentage' are enforced at the validator layer (booking.validator.ts),
-- not via a DB CHECK - mirrors this table's existing reschedule_fee_*
-- convention rather than services/packages' stricter CHECK-constraint one.
--
-- Starts disabled system-wide (default false, matching reschedule_fee_
-- enabled's own default) - no behavior change ships until an Admin
-- configures it via the Policies page.

alter table public.policy_configurations
  add column downpayment_enabled boolean not null default false,
  add column downpayment_type text
    check (downpayment_type is null or downpayment_type in ('Flat', 'Percentage')),
  add column downpayment_amount numeric(10, 2)
    check (downpayment_amount is null or downpayment_amount > 0);

comment on column public.policy_configurations.downpayment_enabled is
  'Whether an online booking transaction requires a downpayment. System-default + per-branch-override, resolved by resolveEffectivePolicy/resolveDownpaymentPolicy in staffPicker.service.ts.';
comment on column public.policy_configurations.downpayment_type is
  'Flat = downpayment_amount is a PHP figure; Percentage = downpayment_amount is a 0-100 percentage of the booking''s total_price. NULL unless downpayment_enabled is true.';
comment on column public.policy_configurations.downpayment_amount is
  'Flat PHP amount or percentage (see downpayment_type) applied to a booking''s total_price at creation time (createBooking in booking.service.ts). NULL unless downpayment_enabled is true.';
