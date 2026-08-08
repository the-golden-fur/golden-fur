-- Custom change (P-1 roadmap item): "Add a 'requires downpayment' checkbox
-- (with a specified amount) when creating a service or package - broader
-- than the existing branch-level Hotel downpayment percentage (Module 9),
-- which is already implemented." Module 9's policy_configurations.
-- downpayment_percentage stays exactly as-is (a Hotel-only, branch-wide
-- percentage-of-total fallback - see booking.service.ts's
-- HOTEL_DOWNPAYMENT_RATE); this adds a second, independent mechanism: a
-- flat peso amount an admin can pin to any individual service or package,
-- in any category. See the companion migration 20260808111 for how the two
-- combine at booking time (catalog amount wins when present, Hotel's
-- percentage fallback otherwise) and for the new booking-level gating flag.
--
-- Same additive shape as 20260807106_m13_optional_pricing_matrix.sql - an
-- opt-in boolean plus a paired value, off by default for every existing row.

alter table public.services
  add column requires_downpayment boolean not null default false,
  add column downpayment_amount numeric(10, 2),
  add constraint services_downpayment_amount_check
    check (
      (requires_downpayment = false and downpayment_amount is null)
      or (requires_downpayment = true and downpayment_amount > 0)
    );

alter table public.packages
  add column requires_downpayment boolean not null default false,
  add column downpayment_amount numeric(10, 2),
  add constraint packages_downpayment_amount_check
    check (
      (requires_downpayment = false and downpayment_amount is null)
      or (requires_downpayment = true and downpayment_amount > 0)
    );

comment on column public.services.requires_downpayment is
  'Whether booking this service requires a downpayment before the service may start. Not category-gated (accepted for any category, same convention as min_nights_for_free_package) - expected to be used mainly for Hotel/Pet Hotel services per the roadmap note, but not restricted to it. See resolveBookingItem in booking.service.ts.';
comment on column public.services.downpayment_amount is
  'Flat PHP downpayment amount required for this service. NULL unless requires_downpayment is true (services_downpayment_amount_check). Takes precedence over the Hotel-only percentage fallback (policy_configurations.downpayment_percentage) when set - see resolveBookingItem/createBooking in booking.service.ts.';
comment on column public.packages.requires_downpayment is
  'Whether booking this package requires a downpayment before the service may start. Same convention as services.requires_downpayment above.';
comment on column public.packages.downpayment_amount is
  'Flat PHP downpayment amount required for this package. NULL unless requires_downpayment is true (packages_downpayment_amount_check).';
