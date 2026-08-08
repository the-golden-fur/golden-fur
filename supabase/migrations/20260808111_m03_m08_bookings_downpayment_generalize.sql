-- Custom change (P-1 roadmap item), companion to 20260808110: generalizes
-- bookings.downpayment_amount (previously Hotel-only, hardcoded 50% of
-- total_price) to also cover the new catalog-level services/packages.
-- requires_downpayment flag. booking.service.ts's createBooking now computes
-- downpayment_amount as: the sum of the selected items' catalog
-- downpayment_amount when any item is flagged requires_downpayment, falling
-- back to the existing Hotel 50%-of-total rule only when no item is flagged
-- - so a booking with no flagged items behaves exactly as before.
--
-- downpayment_required is a new snapshot flag (true only via the catalog
-- path above - the Hotel percentage fallback alone does NOT set it, keeping
-- that pre-existing flow's "no payment gate on initial status" behavior
-- unchanged). It exists so the Grooming/Hotel/Daycare/Veterinary queues
-- (grooming.service.ts, consultation.service.ts, booking.service.ts's
-- listBookings via its new excludeUnpaidDownpayment filter) can cheaply
-- exclude a Pending/In Progress booking whose downpayment hasn't been paid
-- yet, without a join back to booking_items/services/packages on every
-- queue read. "Paid" is read off the existing payment_stage column (Unpaid
-- -> Paid in Advance -> Paid, added by 20260803082) rather than a new
-- boolean - a downpayment-required booking is gated exactly while
-- payment_stage = 'Unpaid', and un-gates itself the moment staff (or the
-- customer paying online) advances it, via the same Mark as Paid /
-- advancePaymentStage machinery every other booking already uses.

alter table public.bookings
  add column downpayment_required boolean not null default false;

comment on column public.bookings.downpayment_required is
  'True when at least one selected service/package was flagged requires_downpayment at booking creation (see createBooking in booking.service.ts). Drives queue gating: a Pending/In Progress booking with downpayment_required = true and payment_stage = ''Unpaid'' is excluded from the Grooming/Hotel/Daycare/Veterinary staff queues until payment_stage advances.';

comment on column public.bookings.downpayment_amount is
  'The downpayment amount collected/expected for this booking, snapshotted at creation. Either the sum of the selected items'' catalog downpayment_amount (services.downpayment_amount/packages.downpayment_amount, when downpayment_required is true - see 20260808110), or, when no item is flagged, the pre-existing Hotel-only 50%-of-total_price fallback (HOTEL_DOWNPAYMENT_RATE in booking.service.ts). NULL when neither applies.';

create index bookings_downpayment_gate_idx
  on public.bookings (downpayment_required, payment_stage)
  where downpayment_required = true;
