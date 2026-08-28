-- Companion to 20260828143: the per-catalog-item downpayment mechanism
-- (services.requires_downpayment/downpayment_amount/downpayment_type,
-- packages same - added by 20260808110, extended by 20260808112) is
-- superseded by the new per-transaction policy_configurations.downpayment_*
-- columns and removed entirely. createBooking no longer sums a
-- requires_downpayment flag across selected items (and no longer rejects
-- combining one with other items) - it resolves one downpayment amount
-- against the whole booking's total_price instead. See
-- resolveDownpaymentPolicy in staffPicker.service.ts and createBooking in
-- booking.service.ts.

alter table public.services
  drop constraint services_downpayment_amount_check,
  drop column requires_downpayment,
  drop column downpayment_amount,
  drop column downpayment_type;

alter table public.packages
  drop constraint packages_downpayment_amount_check,
  drop column requires_downpayment,
  drop column downpayment_amount,
  drop column downpayment_type;
