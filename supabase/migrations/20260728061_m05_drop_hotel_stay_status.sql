-- M05 follow-up (booking-status unification): hotel_stays no longer tracks
-- its own lifecycle status - it now lives solely on the parent bookings row
-- (bookings.status), driven by the same Start/Complete/Mark as Paid actions
-- every other category uses (physical check-in triggers Start, checkout
-- triggers Complete/Paid). hotel_stays.booking_id is NOT NULL (every stay
-- belongs to exactly one Hotel booking), so nothing is lost by dropping
-- this column - every read that filtered hotel_stays.status = 'Active' now
-- joins to bookings.status = 'In Progress' instead
-- (careLogFlagging.service.ts, careLogCompletion.service.ts,
-- checkout.service.ts, hotelStay.service.ts's list filter).
--
-- check_in_at/actual_check_out_at are kept as-is - unlike grooming's
-- started_at/completed_at, these are meaningfully Hotel-specific timestamps
-- consumed directly by checkout's extension-fee calculation, not pure status
-- duplicates.

drop index if exists public.hotel_stays_status_idx;

alter table public.hotel_stays
  drop column status;
